// Control contra lo DESPLEGADO de los tres hallazgos de la auditoría de Mateo del 15/9 sobre
// H2.1 (Lucía en el worker real): mismo patrón que tests/sql/lucia-desplegada.mjs (teléfono
// ficticio 5490000000…, SIN "+" — con "+" el worker no lo toma como ficticio y probaría mandar
// algo por Meta de verdad), mensajes por registrar_mensaje_entrante como los deja el webhook.
//
// OJO: esto prueba lo que está DESPLEGADO en la función `worker`, no el código de este
// worktree. Si el worker todavía no se redesplegó con los commits de agente del 15/9
// (confirmacion_doble, soloNoTexto, TIPOS_QUE_SON_TEXTO), los controles [1] y [2] van a fallar
// mostrando los bugs de siempre (dos confirmaciones / sin respuesta a la foto) — no es que el
// arreglo esté mal, es que el worker desplegado todavía no lo tiene. Volver a desplegar la
// función `worker` desde la rama agente y correr de nuevo.
//
//  [1] Doble confirmación (barandilla confirmacion_doble): al agendar, UNA sola respuesta.
//  [2] Supuesto #33 (soloNoTexto): una foto sin texto contesta con el texto fijo, y no gastó
//      ningún LLM (cero filas en consumo_llm para esa charla).
//  [3] Botón "Necesito reprogramar" cuenta como texto (TIPOS_QUE_SON_TEXTO): no cae en la misma
//      rama que la foto, Lucía no contesta que no puede leer fotos.
//
// Borra todo lo que crea; [1] y [3] gastan unos centavos de OpenAI, [2] no debería gastar nada
// (esa es justamente la prueba).
// Uso: node tests/sql/agente-correcciones-desplegado.mjs
import "dotenv/config";
import pg from "pg";

const TEL = "5490000000091";
const TZ = "America/Argentina/Cordoba";
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

const formato = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fechaEnArgentina = (dias) => formato.format(new Date(Date.now() + dias * 86_400_000));
const EN_2_MESES = fechaEnArgentina(60);

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

let numero = 0;
async function escribir(texto, tipo = "texto", crudoExtra = {}) {
  numero++;
  const crudo = {
    from: TEL,
    id: `wamid.AGENTE159-${Date.now()}-${numero}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: tipo === "texto" ? "text" : tipo,
    ...crudoExtra,
  };
  await db.query("select registrar_mensaje_entrante($1, $2, null, $3, $4, now(), $5::jsonb)", [
    crudo.id,
    TEL,
    tipo,
    texto,
    JSON.stringify(crudo),
  ]);
}

async function charla() {
  const [f] = await filas(
    "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
    [TEL],
  );
  return f?.id ?? null;
}

const salientes = async (conv) =>
  (await filas("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])).map(
    (r) => r.contenido,
  );

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
  return (await filas("select detalle from eventos_agente where conversacion_id = $1 and tipo = 'error' order by creado_at", [conv])).map(
    (r) => JSON.stringify(r.detalle).slice(0, 200),
  );
}

try {
  await limpiar(); // restos de una corrida cortada

  console.log("\n[1] confirmacion_doble: agendar deja UNA sola confirmación, no dos");
  const pasos = [
    `hola, soy carla diaz, necesito un turno de invitada para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
    "dale, la primera que tengas me sirve",
  ];
  let conv = null;
  let respuestaFinal = [];
  for (const texto of pasos) {
    conv = await charla();
    const antes = conv ? (await salientes(conv)).length : 0;
    await escribir(texto);
    respuestaFinal = await esperarRespuesta(antes);
    conv = await charla();
  }
  const [turno] = await filas("select t.* from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1", [TEL]);
  assert(Boolean(turno), `quedó un turno agendado en la base (${turno?.estado ?? "ninguno"})`);
  console.log(`    respuesta al agendar: ${JSON.stringify(respuestaFinal)}`);
  assert(respuestaFinal.length === 1, `una sola burbuja de confirmación, no dos (llegaron ${respuestaFinal.length})`);
  if (!turno) console.log("    errores:", await erroresDelTurno(conv));

  console.log("\n[2] supuesto #33: una foto sin texto contesta con el texto fijo, sin gastar ningún LLM");
  {
    const antes = (await salientes(conv)).length;
    await escribir(null, "image", { image: { id: "wamid.imagen-de-prueba" } });
    const r = await esperarRespuesta(antes);
    console.log(`    respuesta a la foto: ${JSON.stringify(r)}`);
    const [{ valor }] = await filas("select valor from contexto_agente where clave = 'texto_mensaje_no_soportado'");
    assert(r.length === 1 && r[0] === valor, `contestó con el texto fijo de contexto_agente («${String(valor).slice(0, 60)}...»)`);
    const [{ n: llamadas }] = await filas(
      `select count(*)::int as n from consumo_llm where conversacion_id = $1
         and creado_at >= now() - interval '2 minutes'`,
      [conv],
    );
    assert(llamadas === 0, `no llamó a ningún LLM para esto (${llamadas} fila/s nueva/s en consumo_llm)`);
  }

  console.log('\n[3] botón «Necesito reprogramar» cuenta como texto, no como "no es texto"');
  {
    const antes = (await salientes(conv)).length;
    await escribir("Necesito reprogramar", "button", { button: { text: "Necesito reprogramar", payload: "REPROGRAMAR:00000000-0000-0000-0000-000000000000" } });
    const r = await esperarRespuesta(antes);
    console.log(`    respuesta al botón: ${JSON.stringify(r)}`);
    const [{ valor: textoNoSoportado }] = await filas("select valor from contexto_agente where clave = 'texto_mensaje_no_soportado'");
    assert(r.length > 0, "Lucía contestó algo (no se quedó en silencio)");
    assert(!r.includes(textoNoSoportado), "no contestó el texto fijo de 'no puedo leer fotos' — el botón se leyó como texto");
  }
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar();
  const [{ n }] = await filas("select count(*)::int as n from clientes where telefono = $1", [TEL]);
  console.log(`\nRestos de la prueba en la base: ${n}`);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ Los tres hallazgos de la auditoría del 15/9 quedaron resueltos en lo desplegado.");
process.exit(fallas ? 1 : 0);
