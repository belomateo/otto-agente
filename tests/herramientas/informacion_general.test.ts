// «Cuando piden información en general, que no les mande todo junto» (Mateo, 15/10): el primer mensaje que pide
// información o pregunta cómo es el alquiler se contesta con un saludo y el texto fijo de los tres pasos, sin pasar
// por el modelo. Lo puntual (precio, turno…) y lo que ya no es el primer mensaje siguen como siempre.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { correrTurno as correrTurnoReal } from "../../supabase/functions/_shared/turno/turno.ts";
import { TEXTO_COMO_FUNCIONA_RESPALDO } from "../../supabase/functions/_shared/turno/informacion_general.ts";
import { comoChat } from "./_openai_simulado.ts";
import { AHORA, prueba, TZ } from "./_arnes.ts";

const correrTurno: typeof correrTurnoReal = (db, p) => correrTurnoReal(db, { ...p, fetcher: p.fetcher ? comoChat(p.fetcher) : p.fetcher });

type Sql = import("npm:pg@8.13.1").Client;
const mensaje = (sql: Sql, conversacionId: string, direccion: "entrante" | "saliente", contenido: string, en: Date) =>
  sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, $2, 'texto', $3, $4::timestamptz)",
    [conversacionId, direccion, contenido, en.toISOString()],
  );
const antes = (segundos: number) => new Date(AHORA.getTime() - segundos * 1000);

function respuestaChat(contenido: string) {
  return {
    ok: true, status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content: contenido } }], usage: { prompt_tokens: 10, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } } }),
  } as unknown as Response;
}

// Clasificador y extractor neutros; el principal contesta TEXTO_DEL_MODELO. Cuenta cuántas veces se lo llamó.
function modeloQueCuenta(): { fetcher: typeof fetch; llamadas: () => number } {
  let n = 0;
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nombre = body.response_format?.json_schema?.name;
    if (nombre === "clasificacion") return Promise.resolve(respuestaChat(JSON.stringify({ intencion: "alquiler", urgencia: "baja", derivar_duro: false, motivo_derivacion: null })));
    if (nombre === "ficha") return Promise.resolve(respuestaChat(JSON.stringify({ nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null })));
    n++;
    return Promise.resolve(respuestaChat("RESPUESTA DEL MODELO"));
  }) as unknown as typeof fetch;
  return { fetcher, llamadas: () => n };
}

const sinModelo = (() => {
  throw new Error("no tendría que llamar a ningún modelo");
}) as unknown as typeof fetch;

const turno = (e: { ctx: { db: import("../../supabase/functions/_shared/db.ts").Db; cliente: { id: string; telefono: string } }; conversacionId: string }, fetcher: typeof fetch) =>
  correrTurno(e.ctx.db, {
    clienteId: e.ctx.cliente.id, telefono: e.ctx.cliente.telefono, conversacionId: e.conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

prueba("el texto del anuncio («quisiera más información») sale con saludo y el texto de los tres pasos, sin modelo", async (e) => {
  await mensaje(e.sql, e.conversacionId, "entrante", "Hola! Quisiera mas informacion sobre alquiler de trajes", AHORA);
  const r = await turno(e, sinModelo);
  assertEquals(r.mensajesAlCliente.length, 2, r.mensajesAlCliente.join(" | "));
  assertMatch(r.mensajesAlCliente[0], /^Hola! Soy Lucía, del equipo de Mr Otto\.$/);
  assertEquals(r.mensajesAlCliente[1], TEXTO_COMO_FUNCIONA_RESPALDO);
  assert(r.mensajesAlCliente[1].includes("1️⃣") && r.mensajesAlCliente[1].includes("3️⃣"), "la lista de pasos va entera en un mensaje");
  assertEquals(/[¡¿]/.test(r.mensajesAlCliente.join(" ")), false, "sin signos de apertura");
  assertEquals(r.derivo, false);
});

prueba("el saludo lleva el nombre del cliente cuando lo hay", async (e) => {
  await e.sql.query("update clientes set nombre = 'Walter' where id = $1", [e.clienteId]);
  await mensaje(e.sql, e.conversacionId, "entrante", "Buenas tardes, quería información", AHORA);
  const r = await turno(e, sinModelo);
  assertEquals(r.mensajesAlCliente[0], "Hola, Walter! Soy Lucía, del equipo de Mr Otto.");
});

prueba("preguntar cómo es el procedimiento también cuenta", async (e) => {
  await mensaje(e.sql, e.conversacionId, "entrante", "Hola, cómo funciona el alquiler?", AHORA);
  const r = await turno(e, sinModelo);
  assertEquals(r.mensajesAlCliente.length, 2);
  assertEquals(r.mensajesAlCliente[1], TEXTO_COMO_FUNCIONA_RESPALDO);
});

prueba("el texto se edita en el panel: si contexto_agente.texto_como_funciona tiene algo, sale eso", async (e) => {
  await e.sql.query(
    `insert into contexto_agente (clave, valor) values ('texto_como_funciona', 'Texto editado en el panel') on conflict (clave) do update set valor = excluded.valor`,
  );
  await mensaje(e.sql, e.conversacionId, "entrante", "Hola, quería información", AHORA);
  const r = await turno(e, sinModelo);
  assertEquals(r.mensajesAlCliente[1], "Texto editado en el panel");
});

prueba("caso parecido: una pregunta puntual (precio) no dispara el texto: la contesta el modelo", async (e) => {
  await mensaje(e.sql, e.conversacionId, "entrante", "Hola, cuánto sale alquilar un traje?", AHORA);
  const m = modeloQueCuenta();
  const r = await turno(e, m.fetcher);
  assert(m.llamadas() > 0, "tendría que haber llamado al modelo");
  assertEquals(r.mensajesAlCliente.includes(TEXTO_COMO_FUNCIONA_RESPALDO), false);
});

prueba("caso parecido: si ya contó su evento y su fecha, la contesta el modelo", async (e) => {
  await mensaje(e.sql, e.conversacionId, "entrante", "Quiero información para un casamiento el 20 de diciembre", AHORA);
  const m = modeloQueCuenta();
  await turno(e, m.fetcher);
  assert(m.llamadas() > 0);
});

prueba("caso parecido: si no es el primer mensaje, un «info por favor» lo contesta el modelo", async (e) => {
  await mensaje(e.sql, e.conversacionId, "entrante", "Hola", antes(300));
  await mensaje(e.sql, e.conversacionId, "saliente", "Hola! Soy Lucía, del equipo de Mr Otto. En qué te puedo ayudar?", antes(280));
  await mensaje(e.sql, e.conversacionId, "entrante", "info por favor", AHORA);
  const m = modeloQueCuenta();
  const r = await turno(e, m.fetcher);
  assert(m.llamadas() > 0);
  assertEquals(r.mensajesAlCliente.includes(TEXTO_COMO_FUNCIONA_RESPALDO), false);
});
