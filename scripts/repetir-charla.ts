// Repite una charla real con el código de este repo (aunque no esté desplegado), la base real y el
// modelo real, para ver "qué hubiera contestado Lucía". Todo pasa adentro de una transacción que
// termina en rollback: no se manda nada por WhatsApp y no queda nada en la base.
//
// Copia la ficha del cliente a un cliente de prueba y la charla hasta el primer mensaje elegido.
// Desde ahí, cada mensaje elegido es un turno de Lucía; entre uno y otro solo se copian los
// mensajes del CLIENTE (lo que el equipo escribió después pasó por la derivación real, que en
// este ensayo puede no ocurrir).
//
// Uso (desde la raíz del repo):
//   deno run --no-lock --node-modules-dir=none -A --env-file=.env scripts/repetir-charla.ts \
//     <conversacion_id> <enviado_at del 1er mensaje a contestar> [<enviado_at del 2º> ...] \
//     [--modelos ../otto-agente-ia/.env] [--ficha-vacia]
// --modelos: un .env de donde tomar SOLO LLM_PRINCIPAL/CLASIFICADOR/EXTRACTOR si este no los tiene.
// Más cómodo: node scripts/ejecutar-prueba-real.mjs --modelos ../otto-agente-ia/.env --repetir <args>.

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { parse } from "jsr:@std/dotenv@0.225.5";
import { type ClienteSql, dbDesde } from "../supabase/functions/_shared/db.ts";
import { calendarioDeEnsayo } from "../supabase/functions/_shared/herramientas/tipos.ts";
import { correrTurno } from "../supabase/functions/_shared/turno/turno.ts";

const args = [...Deno.args];
const iModelos = args.indexOf("--modelos");
if (iModelos >= 0) {
  const modelos = parse(await Deno.readTextFile(args[iModelos + 1]));
  for (const k of ["LLM_PRINCIPAL", "LLM_CLASIFICADOR", "LLM_EXTRACTOR"]) {
    if (!Deno.env.get(k) && modelos[k]) Deno.env.set(k, modelos[k]);
  }
  args.splice(iModelos, 2);
}
// --ficha-vacia: el cliente de prueba arranca solo con el nombre. Sin esto se copia la ficha de
// HOY, que puede traer datos que en ese momento de la charla todavía no se sabían.
const iVacia = args.indexOf("--ficha-vacia");
const fichaVacia = iVacia >= 0;
if (fichaVacia) args.splice(iVacia, 1);
// --prompt-repo: usa plantilla-agente/02-prompt.md tal cual está en el repo, sin cargarlo (dentro
// de la transacción, que termina en rollback). Sirve para probar un cambio de prompt antes de
// ponerlo en producción.
const iPromptRepo = args.indexOf("--prompt-repo");
const promptRepo = iPromptRepo >= 0;
if (promptRepo) args.splice(iPromptRepo, 1);
// --antes <archivo.sql>: corre ese SQL adentro de la transacción antes de repetir (una migración
// de datos todavía sin aplicar: fragmentos, textos fijos). Se puede repetir.
const sqlAntes: string[] = [];
for (let i = args.indexOf("--antes"); i >= 0; i = args.indexOf("--antes")) {
  sqlAntes.push(await Deno.readTextFile(args[i + 1]));
  args.splice(i, 2);
}
const [conversacionReal, ...puntos] = args;
if (!conversacionReal || puntos.length === 0) throw new Error("Uso: repetir-charla.ts <conversacion_id> <enviado_at> [...]");
const TZ = Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Buenos_Aires";
const hm = (d: Date) => d.toLocaleString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const sql = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
await sql.connect();
try {
  await sql.query("begin");
  await sql.query("set local otto.sin_disparo = 'on'"); // que ningún trigger encole ni dispare envíos
  for (const s of sqlAntes) await sql.query(s);
  if (promptRepo) {
    await sql.query("update prompt_base set texto = $1 where unica", [await Deno.readTextFile(new URL("../plantilla-agente/02-prompt.md", import.meta.url))]);
  }
  const { rows: [real] } = await sql.query(
    `select cl.nombre, cl.evento, cl.fecha_evento, cl.rol, cl.dia_o_noche, cl.talle_aprox
       from conversaciones co join clientes cl on cl.id = co.cliente_id where co.id = $1`,
    [conversacionReal],
  );
  if (!real) throw new Error(`No existe la conversación ${conversacionReal}`);
  const telefono = `549000${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const { rows: [{ id: clienteId }] } = await sql.query(
    `insert into clientes (telefono, nombre, evento, fecha_evento, rol, dia_o_noche, talle_aprox)
     values ($1, $2, $3, $4, $5, $6, $7) returning id::text as id`,
    fichaVacia
      ? [telefono, real.nombre, null, null, null, null, null]
      : [telefono, real.nombre, real.evento, real.fecha_evento, real.rol, real.dia_o_noche, real.talle_aprox],
  );
  const { rows: [{ id: conversacionId }] } = await sql.query(
    "insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id",
    [clienteId],
  );
  const { rows: [{ p: prompt }] } = await sql.query("select prompt_vigente() as p");
  const copiar = (desde: string | null, hasta: string, soloCliente: boolean) =>
    sql.query(
      `insert into mensajes (conversacion_id, direccion, tipo, contenido, transcripcion, enviado_at)
       select $1, direccion, tipo, contenido, transcripcion, enviado_at from mensajes
        where conversacion_id = $2 and enviado_at <= $3::timestamptz
          and ($4::timestamptz is null or enviado_at > $4::timestamptz)
          and (not $5 or direccion = 'entrante')`,
      [conversacionId, conversacionReal, hasta, desde, soloCliente],
    );

  let anterior: string | null = null;
  for (const punto of puntos) {
    await copiar(anterior, punto, anterior !== null);
    const { rows: nuevos } = await sql.query(
      `select contenido from mensajes where conversacion_id = $1 and direccion = 'entrante'
        and ($2::timestamptz is null or enviado_at > $2::timestamptz) and enviado_at <= $3::timestamptz order by enviado_at`,
      [conversacionId, anterior, punto],
    );
    const ahora = new Date(new Date(punto).getTime() + 5000);
    const { rows: [{ estado, lucia_activa }] } = await sql.query("select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
    for (const n of nuevos) console.log(`[${hm(ahora)}] CLIENTE: ${n.contenido}`);
    if (!lucia_activa) {
      console.log("   (Lucía ya derivó y está apagada: no contesta)");
      anterior = punto;
      continue;
    }
    const r = await correrTurno(dbDesde(sql as unknown as ClienteSql), {
      clienteId, telefono, conversacionId, ahora, tz: TZ, calendario: calendarioDeEnsayo, derivacionTel: null, prompt,
      yaDerivada: estado === "derivada",
    });
    // La respuesta queda en la charla con la hora del ensayo, para que el próximo turno la vea en orden.
    await sql.query(
      "update mensajes set enviado_at = $2::timestamptz + interval '1 second' where conversacion_id = $1 and direccion = 'saliente' and enviado_at > $2::timestamptz",
      [conversacionId, punto],
    );
    for (const m of r.mensajesAlCliente) console.log(`[${hm(ahora)}] LUCÍA: ${m.replace(/\n+/g, " ⏎ ")}`);
    const { rows: ev } = await sql.query(
      `select tipo, detalle from eventos_agente where conversacion_id = $1
        and tipo in ('herramienta', 'error', 'derivacion') order by creado_at`,
      [conversacionId],
    );
    for (const e of ev.splice(0)) {
      const d = e.detalle as Record<string, unknown>;
      const que = d.herramienta
        ? `${d.herramienta}(${JSON.stringify(d.argumentos)})${d.rechazo ? ` → rechazo ${d.rechazo}` : ""}`
        : d.saltos
        ? `saltos: ${(d.saltos as { barandilla: string; motivo: string }[]).map((s) => `${s.barandilla} (${s.motivo})`).join("; ")}`
        : `${d.barandilla ?? d.motivo ?? ""} ${d.accion ?? ""}${d.barandilla && d.motivo ? ` — ${d.motivo}` : ""}`;
      console.log(`     · ${e.tipo}: ${String(que).slice(0, 400)}`);
      // Lo que Lucía quiso mandar cuando la frenó una barandilla (turno.ts, 6/10).
      if (d.borrador) console.log(`       borrador: ${String(d.borrador).replace(/\n+/g, " ⏎ ").slice(0, 500)}`);
    }
    await sql.query("delete from eventos_agente where conversacion_id = $1", [conversacionId]); // así cada turno muestra solo lo suyo
    console.log(`   derivó: ${r.derivo}`);
    anterior = punto;
  }
} finally {
  await sql.query("rollback");
  await sql.end();
}
