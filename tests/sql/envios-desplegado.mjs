// Control de H1.14 contra lo DESPLEGADO (no local): cron-envios (pide el secreto, no manda nada
// mientras CRONS_ENVIOS no valga "on", rechaza un tipo desconocido), los tres crons programados,
// y el botón "Confirmo" de punta a punta: el mensaje entra por registrar_mensaje_entrante con la
// charla DERIVADA, el trigger dispara el worker desplegado y el turno queda confirmado por el
// cliente. Usa un teléfono de prueba que no está en WORKER_STUB_TELEFONOS (con los envíos
// apagados no se le contesta) y borra todo lo que crea al terminar.
// Uso: node tests/sql/envios-desplegado.mjs
import "dotenv/config";
import pg from "pg";

const BASE = `${process.env.SUPABASE_URL}/functions/v1`;
const SECRETO = process.env.WORKER_SECRET;
const TEL = "5490000000078";

if (!SECRETO || !process.env.SUPABASE_URL || !process.env.SUPABASE_DB_URL) {
  console.error("Faltan SUPABASE_URL, SUPABASE_DB_URL y WORKER_SECRET en .env.");
  process.exit(1);
}

let fallas = 0;
const assert = (ok, msg) => {
  console.log(`  ${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const cron = (cuerpo, conSecreto = true) =>
  fetch(`${BASE}/cron-envios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(conSecreto ? { "x-worker-secret": SECRETO } : {}) },
    body: JSON.stringify(cuerpo),
  });

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();

// turnos → clientes es ON DELETE RESTRICT: primero los turnos. El historial de lo que se editó
// en la prueba también se va.
async function limpiar() {
  const turnos = (await db.query(
    "select t.id from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1",
    [TEL],
  )).rows.map((r) => r.id);
  if (turnos.length) {
    await db.query("delete from historial_ediciones where tabla = 'turnos' and fila_id = any($1::uuid[])", [turnos]);
    await db.query("delete from turnos where id = any($1::uuid[])", [turnos]);
  }
  await db.query(
    "delete from historial_ediciones where tabla = 'clientes' and fila_id in (select id from clientes where telefono = $1)",
    [TEL],
  );
  await db.query("delete from clientes where telefono = $1", [TEL]);
}

try {
  await limpiar(); // restos de una corrida cortada

  console.log("\n[1] cron-envios");
  let r = await cron({ tipo: "recordatorio_24h" }, false);
  await r.text();
  assert(r.status === 403, "sin x-worker-secret: 403");
  r = await cron({ tipo: "recordatorio_24h" });
  const j = await r.json().catch(() => ({}));
  assert(r.status === 200 && j.apagado === true, `con el secreto y los envíos apagados: no manda nada (${r.status} ${JSON.stringify(j)})`);
  r = await cron({ tipo: "cualquiera" });
  await r.text();
  assert(r.status === 400, "un tipo desconocido: 400");
  const jobs = (await db.query("select jobname from cron.job where jobname like 'envios-%' and active order by 1")).rows
    .map((f) => f.jobname);
  assert(
    jobs.join(",") === "envios-agradecimiento,envios-recontacto,envios-recordatorio",
    `los tres crons de envíos están programados y activos (${jobs.join(", ")})`,
  );

  console.log("\n[2] Botón Confirmo de punta a punta, con la charla derivada");
  const cliente = (await db.query("insert into clientes (telefono, nombre) values ($1, 'Prueba 1.14') returning id", [TEL]))
    .rows[0].id;
  const turno = (await db.query(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin)
     values ($1, 'invitado', 45, 3, '2030-06-12T14:00:00-03:00', '2030-06-12T14:45:00-03:00') returning id`,
    [cliente],
  )).rows[0].id;
  await db.query("insert into conversaciones (cliente_id, estado) values ($1, 'derivada')", [cliente]);
  const crudo = {
    from: TEL,
    id: `wamid.BOTON-${Date.now()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "button",
    button: { text: "Confirmo", payload: `CONFIRMO:${turno}` },
  };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'button', 'Confirmo', now(), $3::jsonb)", [
    crudo.id,
    TEL,
    JSON.stringify(crudo),
  ]);

  let fila = null;
  for (let i = 0; i < 45; i++) {
    await esperar(2000);
    fila = (await db.query("select estado, confirmado, confirmado_por from turnos where id = $1", [turno])).rows[0];
    if (fila?.confirmado) break;
  }
  assert(
    fila?.confirmado === true && fila.estado === "confirmado" && fila.confirmado_por === "cliente",
    `el worker desplegado confirmó el turno (estado ${fila?.estado}, confirmado_por ${fila?.confirmado_por})`,
  );
  const eventos = (await db.query(
    `select e.detalle from eventos_agente e join conversaciones c on c.id = e.conversacion_id
      where c.cliente_id = $1 and e.detalle->>'etapa' = 'boton-confirmo'`,
    [cliente],
  )).rows;
  assert(eventos.length === 1 && eventos[0].detalle.resultado === "confirmado", "queda el evento boton-confirmo en la bitácora");
  const salientes = (await db.query(
    `select count(*)::int as n from mensajes m join conversaciones c on c.id = m.conversacion_id
      where c.cliente_id = $1 and m.direccion = 'saliente'`,
    [cliente],
  )).rows[0].n;
  assert(salientes === 0, "con los envíos apagados y un número fuera de la lista de prueba, no se le contesta");
  const trabajo = (await db.query(
    "select t.estado from cola_trabajos t join conversaciones c on c.id = t.conversacion_id where c.cliente_id = $1",
    [cliente],
  )).rows[0];
  assert(trabajo?.estado === "hecho", `el trabajo quedó hecho (${trabajo?.estado})`);
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar();
  const restos = (await db.query("select count(*)::int as n from clientes where telefono = $1", [TEL])).rows[0].n;
  console.log(`\nRestos de la prueba en la base: ${restos}`);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ H1.14: los controles contra lo desplegado pasaron.");
process.exit(fallas ? 1 : 0);
