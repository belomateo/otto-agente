// Una charla inventada con la Lucía de este repo (aunque no esté desplegada), la base real y el
// modelo real, sin dejar rastro: todo pasa adentro de una transacción que termina en rollback, así
// que no se manda nada por WhatsApp y no queda nada en el panel. Es el hermano de repetir-charla.ts
// para charlas que no existieron: la usan el probador que intenta confundir a Lucía y las pruebas
// finales (10/10).
//
// Uso (desde la raíz del repo):
//   deno run --no-lock --node-modules-dir=none -A --env-file=.env scripts/charla-de-prueba.ts <charla.json> \
//     [--antes <migracion.sql> ...] [--ahora 2026-10-14T15:00:00-03:00]
// charla.json:
//   {
//     "nombre": "Juan",                                  (opcional: el nombre del perfil de WhatsApp)
//     "ficha": { "evento": "casamiento", "fecha_evento": "2026-11-21" },   (opcional)
//     "turnos": [{ "inicio": "2026-10-16T11:00:00-03:00", "estado": "sin-confirmar" }],   (opcional: turnos que ya tiene)
//     "mensajes": ["Hola, cuánto sale?", ["Para un casamiento", "el 21/11"], "dale"]
//   }
// Cada elemento de "mensajes" es un turno del cliente (un texto, o varios seguidos). Entre turno y
// turno pasan 2 minutos. --antes corre ese SQL adentro de la transacción antes de empezar (una
// migración todavía sin aplicar). Al final imprime una línea «ESTADO {json}» con lo que quedó en la
// base adentro de la transacción (turnos, ficha, derivaciones, notas), para verificar contra eso y
// no contra lo que dijo Lucía.

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { type ClienteSql, dbDesde } from "../supabase/functions/_shared/db.ts";
import { calendarioDeEnsayo } from "../supabase/functions/_shared/herramientas/tipos.ts";
import { correrTurno } from "../supabase/functions/_shared/turno/turno.ts";

const args = [...Deno.args];
const sqlAntes: string[] = [];
for (let i = args.indexOf("--antes"); i >= 0; i = args.indexOf("--antes")) {
  sqlAntes.push(await Deno.readTextFile(args[i + 1]));
  args.splice(i, 2);
}
let ahoraBase = new Date();
const iAhora = args.indexOf("--ahora");
if (iAhora >= 0) {
  ahoraBase = new Date(args[iAhora + 1]);
  args.splice(iAhora, 2);
}
const [archivo] = args;
if (!archivo) throw new Error("Uso: charla-de-prueba.ts <charla.json> [--antes <sql>] [--ahora <ISO>]");
type Charla = {
  nombre?: string;
  ficha?: Record<string, string | null>;
  turnos?: { inicio: string; estado?: string; tipo?: string; duracion_min?: number; confirmado?: boolean }[];
  mensajes: (string | string[])[];
};
const charla = JSON.parse(await Deno.readTextFile(archivo)) as Charla;
if (!Array.isArray(charla.mensajes) || charla.mensajes.length === 0) throw new Error("La charla no tiene mensajes");

const TZ = Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Buenos_Aires";
const hm = (d: Date) => d.toLocaleString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const CAMPOS = ["evento", "fecha_evento", "rol", "dia_o_noche", "talle_aprox", "ciudad", "email", "color_preferido", "presupuesto_mencionado"];

const sql = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
await sql.connect();
try {
  await sql.query("begin");
  await sql.query("set local otto.sin_disparo = 'on'"); // que ningún trigger encole ni dispare envíos
  for (const s of sqlAntes) await sql.query(s);

  // Teléfono de prueba (el analista y los reportes excluyen los 5490000…).
  const telefono = `549000${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const { rows: [{ id: clienteId }] } = await sql.query(
    "insert into clientes (telefono, nombre) values ($1, $2) returning id::text as id",
    [telefono, charla.nombre ?? null],
  );
  const ficha = Object.entries(charla.ficha ?? {}).filter(([k]) => CAMPOS.includes(k));
  for (const [campo, valor] of ficha) await sql.query(`update clientes set ${campo} = $2 where id = $1`, [clienteId, valor]);
  const { rows: [{ id: conversacionId }] } = await sql.query(
    "insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id",
    [clienteId],
  );
  for (const t of charla.turnos ?? []) {
    const inicio = new Date(t.inicio);
    const minutos = t.duracion_min ?? 45;
    await sql.query(
      `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, confirmado, editado_por)
       values ($1, $2, $3, 1, $4, $5, $6, $7, 'prueba')`,
      [clienteId, t.tipo ?? "invitado", minutos, inicio.toISOString(), new Date(inicio.getTime() + minutos * 60_000).toISOString(),
        t.estado ?? "sin-confirmar", t.confirmado ?? (t.estado === "confirmado")],
    );
  }
  const prompt = await Deno.readTextFile(new URL("../supabase/functions/_shared/prompt.md", import.meta.url));

  for (let i = 0; i < charla.mensajes.length; i++) {
    const textos = ([] as string[]).concat(charla.mensajes[i]);
    const momento = new Date(ahoraBase.getTime() + i * 2 * 60_000);
    for (let k = 0; k < textos.length; k++) {
      await sql.query(
        "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', $2, $3)",
        [conversacionId, textos[k], new Date(momento.getTime() + k * 1000).toISOString()],
      );
      console.log(`[${hm(momento)}] CLIENTE: ${textos[k]}`);
    }
    const ahora = new Date(momento.getTime() + textos.length * 1000 + 4000);
    const { rows: [{ estado, lucia_activa }] } = await sql.query("select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
    if (!lucia_activa) {
      console.log("   (Lucía ya pasó la charla al equipo y está apagada: no contesta)");
      continue;
    }
    const r = await correrTurno(dbDesde(sql as unknown as ClienteSql), {
      clienteId, telefono, conversacionId, ahora, tz: TZ, calendario: calendarioDeEnsayo, derivacionTel: null, prompt,
      yaDerivada: estado === "derivada",
    });
    // La respuesta queda con la hora del turno, para que el próximo la vea en orden.
    await sql.query(
      "update mensajes set enviado_at = $2::timestamptz where conversacion_id = $1 and direccion = 'saliente' and enviado_at > $2::timestamptz",
      [conversacionId, ahora.toISOString()],
    );
    for (const m of r.mensajesAlCliente) console.log(`[${hm(ahora)}] LUCÍA: ${m.replace(/\n+/g, " ⏎ ")}`);
    const { rows: ev } = await sql.query(
      `select tipo, detalle from eventos_agente where conversacion_id = $1 and tipo in ('herramienta', 'error', 'derivacion') order by creado_at`,
      [conversacionId],
    );
    for (const e of ev) {
      const d = e.detalle as Record<string, unknown>;
      const que = d.herramienta
        ? `${d.herramienta}(${JSON.stringify(d.argumentos)})${d.rechazo ? ` → rechazo ${d.rechazo}` : ""}`
        : d.saltos
        ? `saltos: ${(d.saltos as { barandilla: string; motivo: string }[]).map((s) => `${s.barandilla} (${s.motivo})`).join("; ")}`
        : `${d.barandilla ?? d.motivo ?? d.etapa ?? ""} ${d.accion ?? ""}`;
      console.log(`     · ${e.tipo}: ${String(que).slice(0, 400)}`);
    }
    await sql.query("delete from eventos_agente where conversacion_id = $1", [conversacionId]);
    console.log(`   derivó: ${r.derivo}`);
  }

  // Lo que quedó de verdad, para verificar contra la base y no contra lo que dijo Lucía.
  const { rows: turnos } = await sql.query(
    "select tipo, inicio, estado, confirmado, probador from turnos where cliente_id = $1 order by inicio",
    [clienteId],
  );
  const { rows: [fichaFinal] } = await sql.query(`select nombre, ${CAMPOS.join(", ")} from clientes where id = $1`, [clienteId]);
  const { rows: derivaciones } = await sql.query("select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  const { rows: notas } = await sql.query("select texto from notas where cliente_id = $1 order by creado_at", [clienteId]);
  const { rows: [conv] } = await sql.query("select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
  console.log(`ESTADO ${JSON.stringify({ conversacion: conv, turnos, ficha: fichaFinal, derivaciones, notas: notas.map((n) => n.texto) })}`);
} finally {
  await sql.query("rollback");
  await sql.end();
}
