// Control de H1.11 contra las funciones DESPLEGADAS (no locales): verificación del webhook,
// firma, dedup, avisos de estado, latencia y el disparo del worker desde la base.
// Uso: `node tests/sql/webhook-desplegado.mjs` con WA_APP_SECRET en .env, o con
// PRUEBA_APP_SECRET si en Supabase hay cargado un App Secret de prueba.
// Usa un teléfono de prueba que no está en WORKER_STUB_TELEFONOS (el worker procesa el
// trabajo pero no le contesta a nadie) y borra todo lo que crea al terminar.
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";

const BASE = `${process.env.SUPABASE_URL}/functions/v1`;
const APP_SECRET = process.env.PRUEBA_APP_SECRET || process.env.WA_APP_SECRET;
const VERIFY = process.env.WA_VERIFY_TOKEN;
const TEL = "5490000000077";

if (!APP_SECRET || !VERIFY || !process.env.SUPABASE_URL) {
  console.error("Faltan SUPABASE_URL, WA_VERIFY_TOKEN y WA_APP_SECRET (o PRUEBA_APP_SECRET).");
  process.exit(1);
}

let fallas = 0;
const assert = (ok, msg) => {
  console.log(`  ${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};
const firmar = (cuerpo, secreto = APP_SECRET) =>
  "sha256=" + crypto.createHmac("sha256", secreto).update(cuerpo).digest("hex");

const payloadMensaje = (wamid) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "1383999293336203",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5493417519525", phone_number_id: process.env.WA_PHONE_NUMBER_ID },
          contacts: [{ profile: { name: "Prueba H1.11" }, wa_id: TEL }],
          messages: [{ from: TEL, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hola, prueba del webhook" } }],
        },
      }],
    }],
  });

const payloadEstado = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "1383999293336203", changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses: [{ id: "wamid.SALIENTE-PRUEBA", status: "delivered", timestamp: "1757700000", recipient_id: TEL }] } }] }],
});

async function post(cuerpo, firma) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/webhook-whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(firma ? { "X-Hub-Signature-256": firma } : {}) },
    body: cuerpo,
  });
  await res.text();
  return { status: res.status, ms: Math.round(performance.now() - t0) };
}

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const filas = async () =>
  (await db.query(
    `select (select count(*) from mensajes m join conversaciones c on c.id = m.conversacion_id join clientes cl on cl.id = c.cliente_id where cl.telefono = $1)::int as mensajes,
            (select count(*) from cola_trabajos t join conversaciones c on c.id = t.conversacion_id join clientes cl on cl.id = c.cliente_id where cl.telefono = $1)::int as cola`,
    [TEL]
  )).rows[0];

try {
  await db.query("delete from clientes where telefono = $1", [TEL]); // restos de una corrida cortada

  console.log("\n[1] Verificación del webhook (GET)");
  let r = await fetch(`${BASE}/webhook-whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=4242`);
  assert(r.status === 200 && (await r.text()) === "4242", "token correcto: 200 y devuelve el challenge");
  r = await fetch(`${BASE}/webhook-whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=4242`);
  await r.text();
  assert(r.status === 403, "token incorrecto: 403");

  console.log("\n[2] Firma");
  const wamid = `wamid.PRUEBA-${Date.now()}`;
  const cuerpo = payloadMensaje(wamid);
  assert((await post(cuerpo, null)).status === 401, "POST sin firma: 401");
  assert((await post(cuerpo, firmar(cuerpo, "otro-secreto"))).status === 401, "POST firmado con otro secreto: 401");
  let f = await filas();
  assert(f.mensajes === 0 && f.cola === 0, "ninguno de los dos dejó filas en la base");

  console.log("\n[3] Mensaje firmado, dedup y avisos de estado");
  const primero = await post(cuerpo, firmar(cuerpo));
  assert(primero.status === 200, `mensaje firmado: 200 (${primero.ms} ms, incluye el arranque en frío)`);
  f = await filas();
  assert(f.mensajes === 1 && f.cola === 1, "queda 1 mensaje y 1 trabajo en la cola");
  const repetido = await post(cuerpo, firmar(cuerpo));
  f = await filas();
  assert(repetido.status === 200 && f.mensajes === 1 && f.cola === 1, "el mismo mensaje otra vez: 200 y no se duplica nada");
  const estado = await post(payloadEstado, firmar(payloadEstado));
  f = await filas();
  assert(estado.status === 200 && f.mensajes === 1 && f.cola === 1, "aviso de estado (delivered): 200 y no encola nada");

  console.log("\n[4] Latencia (10 POST firmados, ya en caliente)");
  const tiempos = [];
  for (let i = 0; i < 10; i++) tiempos.push((await post(cuerpo, firmar(cuerpo))).ms);
  tiempos.sort((a, b) => a - b);
  assert(tiempos[9] < 1000, `todos por debajo de 1 s — mediana ${tiempos[5]} ms, máximo ${tiempos[9]} ms`);

  console.log("\n[5] El worker toma el trabajo (disparo desde la base, o el cron en ≤ 60 s)");
  let hecho = null;
  for (let i = 0; i < 45 && !hecho; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const q = await db.query(
      `select t.estado, t.tomado_por,
              (select e.detalle->>'nota' from eventos_agente e where e.conversacion_id = t.conversacion_id order by e.creado_at desc limit 1) as nota
         from cola_trabajos t join conversaciones c on c.id = t.conversacion_id join clientes cl on cl.id = c.cliente_id
        where cl.telefono = $1`,
      [TEL]
    );
    if (q.rows[0]?.estado === "hecho") hecho = q.rows[0];
  }
  assert(hecho !== null, `el trabajo pasó a 'hecho'${hecho ? ` (lo tomó ${hecho.tomado_por})` : " — no pasó en 90 s"}`);
  assert(
    hecho?.nota === "número fuera de la lista de prueba: sin respuesta",
    "la bitácora registra que no se le contestó (el número no está en la lista de prueba)"
  );

  console.log("\n[6] El worker solo acepta a quien trae el secreto");
  r = await fetch(`${BASE}/worker`, { method: "POST" });
  await r.text();
  assert(r.status === 403, "sin x-worker-secret: 403");
  r = await fetch(`${BASE}/worker`, { method: "POST", headers: { "x-worker-secret": "no" } });
  await r.text();
  assert(r.status === 403, "con un secreto incorrecto: 403");
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await db.query("delete from clientes where telefono = $1", [TEL]);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ H1.11: todos los controles contra lo desplegado pasaron.");
process.exit(fallas ? 1 : 0);
