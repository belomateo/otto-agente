// Control del hito 2.3 contra lo DESPLEGADO: el mail del cliente en la charla (decisión #17,
// supuesto #35). Mismo patrón que tests/sql/lucia-desplegada.mjs: teléfono ficticio
// (5490000000…, sin "+" — con "+" el worker no lo toma como ficticio), mensajes por
// registrar_mensaje_entrante como los deja el webhook.
//
// OJO: esto prueba lo que está DESPLEGADO en la función `worker`, no el código de este
// worktree. Si el worker todavía no se redesplegó con los commits de agente del hito 2.3
// (extractor, guardar_datos_cliente, buscar_horarios, turno.ts con prepararParaEnviar), los dos
// guiones van a fallar mostrando el comportamiento de antes — no es que el arreglo esté mal, es
// que el worker desplegado todavía no lo tiene.
//
//  [1] "reserva con mail": el cliente da el mail cuando Lucía se lo pide al ofrecer horarios;
//      queda en clientes.email, en minúscula, y el turno se agenda igual.
//  [2] "no quiere dar el mail": el cliente lo rechaza; el turno se agenda igual y clientes.email
//      queda null (nunca se inventa ni se fuerza).
//
// Borra todo lo que crea; gasta unos centavos de OpenAI.
// Uso: node tests/sql/mail-en-la-charla-desplegado.mjs
import "dotenv/config";
import pg from "pg";

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

async function limpiar(tel) {
  const [cli] = await filas("select id from clientes where telefono = $1", [tel]);
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
async function escribir(tel, texto) {
  numero++;
  const crudo = { from: tel, id: `wamid.MAIL23-${Date.now()}-${numero}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), $4::jsonb)", [crudo.id, tel, texto, JSON.stringify(crudo)]);
}

async function charla(tel) {
  const [f] = await filas(
    "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
    [tel],
  );
  return f?.id ?? null;
}

const salientes = async (conv) =>
  (await filas("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])).map(
    (r) => r.contenido,
  );

async function esperarRespuesta(tel, antes) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await esperar(3000);
    const conv = await charla(tel);
    if (!conv) continue;
    const [{ n }] = await filas(
      "select count(*)::int as n from cola_trabajos where conversacion_id = $1 and estado in ('pendiente', 'procesando')",
      [conv],
    );
    if (n === 0) return (await salientes(conv)).slice(antes);
  }
  throw new Error("el worker no terminó el turno a tiempo");
}

// 2.2 (decisión #17): lo que manda el sistema sale sin «¡» ni «¿» y en 3 mensajes como máximo.
function revisarFormato(respuesta, cuando) {
  assert(
    respuesta.every((m) => !/[¡¿]/.test(m)) && respuesta.length <= 3,
    `${cuando}: sin ¡ ni ¿ y en ${respuesta.length} mensaje/s (máximo 3)`,
  );
}

async function erroresDelTurno(conv) {
  return (await filas("select detalle from eventos_agente where conversacion_id = $1 and tipo = 'error' order by creado_at", [conv])).map(
    (r) => JSON.stringify(r.detalle).slice(0, 200),
  );
}

async function reservar(tel, pasos) {
  let conv = null;
  for (const texto of pasos) {
    conv = await charla(tel);
    const antes = conv ? (await salientes(conv)).length : 0;
    await escribir(tel, texto);
    const r = await esperarRespuesta(tel, antes);
    console.log(`    · «${texto}»\n      → «${r.join(" / ").slice(0, 260)}»`);
    revisarFormato(r, `la respuesta a «${texto.slice(0, 30)}…»`);
    conv = await charla(tel);
    const [turno] = await filas("select id from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1", [tel]);
    if (turno) break;
  }
  return conv;
}

try {
  const TEL_1 = "5490000000092";
  const TEL_2 = "5490000000093";
  await limpiar(TEL_1); // restos de una corrida cortada
  await limpiar(TEL_2);

  console.log('\n[1] "reserva con mail": el cliente lo da cuando Lucía se lo pide, y queda en minúscula');
  {
    const conv = await reservar(TEL_1, [
      `hola, soy carla diaz, necesito un turno de invitada para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
      "dale, la primera que tengas me sirve, mi mail es Carla.Diaz@Gmail.com",
    ]);
    const [turno] = await filas("select t.* from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1", [TEL_1]);
    assert(Boolean(turno), `quedó un turno agendado en la base (${turno?.estado ?? "ninguno"})`);
    const [cliente] = await filas("select email from clientes where telefono = $1", [TEL_1]);
    assert(cliente?.email === "carla.diaz@gmail.com", `el mail quedó guardado en minúscula (guardado: ${cliente?.email ?? "null"})`);
    if (!turno) console.log("    errores:", await erroresDelTurno(conv));
  }

  console.log('\n[2] "no quiere dar el mail": igual agenda, y el mail queda sin forzar');
  {
    const conv = await reservar(TEL_2, [
      `hola, soy martin ruiz, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
      "prefiero no dar mi mail, pero dale, la primera que tengas me sirve",
    ]);
    const [turno] = await filas("select t.* from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1", [TEL_2]);
    assert(Boolean(turno), `quedó un turno agendado en la base igual (${turno?.estado ?? "ninguno"})`);
    const [cliente] = await filas("select email from clientes where telefono = $1", [TEL_2]);
    assert(cliente?.email === null, `el mail quedó null: no se inventa ni se fuerza (guardado: ${cliente?.email ?? "null"})`);
    if (!turno) console.log("    errores:", await erroresDelTurno(conv));
  }
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar("5490000000092");
  await limpiar("5490000000093");
  const [{ n }] = await filas(
    "select count(*)::int as n from clientes where telefono in ('5490000000092', '5490000000093')",
  );
  console.log(`\nRestos de la prueba en la base: ${n}`);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ 2.3: el mail en la charla queda resuelto en lo desplegado.");
process.exit(fallas ? 1 : 0);
