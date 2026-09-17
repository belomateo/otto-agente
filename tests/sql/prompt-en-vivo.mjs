// Control de 0050 contra lo DESPLEGADO: que Lucía esté hablando con el prompt de la BASE y no
// con el .md que viajó adentro de la función. Es la diferencia entre que la dueña edite el panel
// y le llegue, o que edite y no pase nada — que es lo que pasaba hasta hoy.
//
// Manda un mensaje desde un teléfono ficticio (5490000000…, al que el worker contesta pero no le
// escribe por WhatsApp) y lee en la bitácora de dónde sacó el prompt ese turno. Borra todo lo que
// crea; gasta unos centavos de OpenAI.
// Uso: node tests/sql/prompt-en-vivo.mjs
import "dotenv/config";
import pg from "pg";

const TEL = "5490000000081";
const ESPERA_MAX_MS = 120_000;

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
  const turnos = (await filas("select id from turnos where cliente_id = $1", [cli.id])).map((r) => r.id);
  if (turnos.length) {
    await db.query("delete from historial_ediciones where tabla = 'turnos' and fila_id = any($1::uuid[])", [turnos]);
    await db.query("delete from turnos where id = any($1::uuid[])", [turnos]);
  }
  await db.query("delete from historial_ediciones where tabla = 'clientes' and fila_id = $1", [cli.id]);
  await db.query("delete from notas where cliente_id = $1", [cli.id]);
  await db.query("delete from conversaciones where cliente_id = $1", [cli.id]);
  await db.query("delete from clientes where id = $1", [cli.id]);
}

try {
  await limpiar();

  console.log("\n[1] La base puede armar el prompt");
  const [{ p }] = await filas("select prompt_vigente() as p");
  assert(typeof p === "string" && p.length > 1000, `prompt_vigente() devuelve ${p?.length ?? 0} caracteres`);
  assert(p?.startsWith("Sos Lucía,"), "arranca como tiene que arrancar");
  assert(!p?.includes("{{"), "no quedó ningún marcador sin resolver");

  console.log("\n[2] El worker desplegado lo usa");
  const crudo = { from: TEL, id: `wamid.PROMPT-${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hola, que tal" } };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), $4::jsonb)", [crudo.id, TEL, crudo.text.body, JSON.stringify(crudo)]);

  let ev = null;
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite && !ev) {
    await esperar(3000);
    [ev] = await filas(
      `select e.detalle from eventos_agente e
         join conversaciones c on c.id = e.conversacion_id
         join clientes cl on cl.id = c.cliente_id
        where cl.telefono = $1 and e.detalle->>'etapa' = 'worker-lucia'`,
      [TEL],
    );
  }
  assert(Boolean(ev), "el worker desplegado atendió el turno");
  if (ev) {
    assert(
      ev.detalle.prompt === "base",
      `sacó el prompt de la BASE, no del archivo horneado (bitácora: prompt = "${ev.detalle.prompt}")`,
    );
    if (ev.detalle.prompt === "archivo") {
      console.log("     ⚠️  cayó al respaldo: la base no pudo armar un prompt bueno. Revisar prompt_base, reglas_agente y contexto_agente.");
    }
  }
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar();
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ Lucía habla con el prompt que está en la base: lo que edita la dueña le llega.");
process.exit(fallas ? 1 : 0);
