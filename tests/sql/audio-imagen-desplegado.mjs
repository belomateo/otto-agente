// Control en vivo de "Lucía lee audios e imágenes" (pedido de Mateo, 19/9), contra lo
// DESPLEGADO. Verifica el camino que SÍ se puede armar sin depender de un archivo real de Meta:
// un audio con un media_id inventado. El worker (bajarMediosPendientes, deployado y confirmado
// por logica) va a intentar bajarlo de verdad, Meta le va a contestar que no existe, y el
// mensaje tiene que terminar en adjunto_estado='error' — Lucía sigue contestando igual, con el
// texto fijo de "no puedo leer esto", sin romper el turno.
//
// Lo que este control NO prueba: la transcripción real de un audio 'listo' (necesita un archivo
// de Meta de verdad, que no se puede fabricar desde un script). Eso lo certificó logica a mano
// con el audio real que ya está en el bucket ("Hola, Lucía, lo necesito para un casamiento" →
// transcripción correcta, validada contra lo que el mismo cliente después escribió en texto).
// Si hace falta una segunda verificación en vivo de ESE camino, la más simple es reusar ese
// mismo media_id (todavía vive ~30 días en Meta) en un mensaje nuevo de un teléfono ficticio acá
// abajo — pero eso lo tiene que armar quien tenga el media_id a mano.
//
// Mismo andamiaje que lucia-desplegada.mjs / horas-en-contexto-desplegado.mjs
// (registrar_mensaje_entrante + cola_trabajos), teléfono ficticio propio.
// Uso: node tests/sql/audio-imagen-desplegado.mjs
import "dotenv/config";
import pg from "pg";

const TEL = "5490000000099";
const ESPERA_MAX_MS = 150_000;

if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

let fallas = 0;
const assert = (ok, msg) => {
  console.log(`  ${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const filas = async (sql, valores = []) => (await db.query(sql, valores)).rows;

async function limpiar() {
  const [cli] = await filas("select id from clientes where telefono = $1", [TEL]);
  if (!cli) return;
  const convs = (await filas("select id from conversaciones where cliente_id = $1", [cli.id])).map((r) => r.id);
  for (const tabla of ["consumo_llm", "eventos_agente", "derivaciones", "mensajes", "cola_trabajos"]) {
    await db.query(`delete from ${tabla} where conversacion_id = any($1::uuid[])`, [convs]);
  }
  await db.query("delete from conversaciones where cliente_id = $1", [cli.id]);
  await db.query("delete from clientes where id = $1", [cli.id]);
}

let numero = 0;
async function escribirAudio() {
  numero++;
  const crudo = {
    from: TEL,
    id: `wamid.AUDIOIMG21-${Date.now()}-${numero}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "audio",
    audio: { id: "MEDIA_ID_INVENTADO_PARA_LA_PRUEBA", mime_type: "audio/ogg; codecs=opus", voice: true },
  };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'audio', null, now(), $3::jsonb)", [crudo.id, TEL, JSON.stringify(crudo)]);
}

async function charla() {
  const [f] = await filas(
    "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
    [TEL],
  );
  return f?.id ?? null;
}

const salientes = async (conv) =>
  (await filas("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])).map((r) => r.contenido);

async function esperarRespuesta(antes) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await esperar(3000);
    const conv = await charla();
    if (!conv) continue;
    const [{ n }] = await filas(
      "select count(*)::int as n from cola_trabajos where conversacion_id = $1 and estado in ('pendiente', 'procesando')",
      [conv],
    );
    if (n === 0) return (await salientes(conv)).slice(antes);
  }
  throw new Error("el worker no terminó el turno a tiempo");
}

async function erroresDelTurno(conv) {
  return (await filas("select detalle from eventos_agente where conversacion_id = $1 and tipo = 'error' order by creado_at", [conv])).map((r) =>
    JSON.stringify(r.detalle).slice(0, 220)
  );
}

try {
  await limpiar();

  console.log("\n[1] Audio con un media_id que Meta no tiene: el worker lo intenta bajar y falla");
  await escribirAudio();
  const r1 = await esperarRespuesta(0);
  const conv = await charla();
  console.log(`    → «${r1.join(" / ").slice(0, 220)}»`);

  const [fila] = await filas("select adjunto_estado, adjunto_detalle from mensajes where conversacion_id = $1 and tipo = 'audio'", [conv]);
  assert(fila?.adjunto_estado === "error", `el adjunto queda en 'error' (fue: ${fila?.adjunto_estado})`);
  console.log(`    detalle del error: ${fila?.adjunto_detalle}`);
  assert(r1.length > 0, "Lucía contestó igual, no se quedó muda por el adjunto roto");
  if (!r1.length) console.log("    errores:", await erroresDelTurno(conv));

  const [{ n: derivs }] = await filas("select count(*)::int as n from derivaciones where conversacion_id = $1", [conv]);
  assert(derivs === 0, `no derivó por esto, solo avisó que no pudo leerlo (${derivs} derivaciones)`);
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar();
  const [{ n }] = await filas("select count(*)::int as n from clientes where telefono = $1", [TEL]);
  console.log(`\nRestos de la prueba en la base: ${n}`);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ audios/imágenes: el camino de error no rompe el turno, Lucía contesta igual.");
process.exit(fallas ? 1 : 0);
