// Control de Fase 0 (TRABAJO.md § 2): idempotencia del webhook, la cola (dos
// workers no toman el mismo trabajo) y RLS (anon y usuario sin perfil ven cero
// filas). Se corre con `npm test`. Los dos primeros usan una transacción con
// ROLLBACK al final, así no dejan datos de prueba en la base; el de la cola
// necesita dos conexiones reales (SKIP LOCKED entre sesiones no se puede probar
// dentro de una sola transacción) y limpia lo que insertó al terminar.

import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const CONN = process.env.SUPABASE_DB_URL;

if (!CONN) {
  console.error("Falta SUPABASE_DB_URL en .env — no se puede correr tests/sql/run.mjs");
  process.exit(1);
}

let fallas = 0;

function assert(cond, mensaje) {
  if (cond) {
    console.log(`  ✅ ${mensaje}`);
  } else {
    console.error(`  ❌ ${mensaje}`);
    fallas++;
  }
}

async function testIdempotenciaWebhook() {
  console.log("\n[1/3] Idempotencia del webhook (wa_message_id único)");
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    await client.query("begin");
    const cli = await client.query(
      "insert into clientes (telefono) values ('+549000000001') returning id"
    );
    const conv = await client.query(
      "insert into conversaciones (cliente_id) values ($1) returning id",
      [cli.rows[0].id]
    );
    await client.query(
      "insert into mensajes (conversacion_id, wa_message_id, direccion, contenido) values ($1, 'wamid.test-idempotencia', 'entrante', 'hola')",
      [conv.rows[0].id]
    );
    let rechazado = false;
    await client.query("savepoint antes_del_duplicado");
    try {
      await client.query(
        "insert into mensajes (conversacion_id, wa_message_id, direccion, contenido) values ($1, 'wamid.test-idempotencia', 'entrante', 'hola de nuevo')",
        [conv.rows[0].id]
      );
    } catch (err) {
      rechazado = err.code === "23505"; // unique_violation
      await client.query("rollback to savepoint antes_del_duplicado");
    }
    assert(rechazado, "el segundo insert con el mismo wa_message_id se rechaza (unique_violation)");

    const { rows } = await client.query(
      "select count(*)::int as n from mensajes where wa_message_id = 'wamid.test-idempotencia'"
    );
    assert(rows[0].n === 1, "queda exactamente 1 mensaje con ese wa_message_id");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

async function testColaSkipLocked() {
  console.log("\n[2/3] Cola: dos workers no toman el mismo trabajo (FOR UPDATE SKIP LOCKED)");
  const admin = new Client({ connectionString: CONN });
  await admin.connect();
  let jobId;
  try {
    const cli = await admin.query(
      "insert into clientes (telefono) values ('+549000000002') returning id"
    );
    const conv = await admin.query(
      "insert into conversaciones (cliente_id) values ($1) returning id",
      [cli.rows[0].id]
    );
    const job = await admin.query(
      "insert into cola_trabajos (conversacion_id) values ($1) returning id",
      [conv.rows[0].id]
    );
    jobId = job.rows[0].id;

    const workerA = new Client({ connectionString: CONN });
    const workerB = new Client({ connectionString: CONN });
    await workerA.connect();
    await workerB.connect();
    try {
      const [resA, resB] = await Promise.all([
        workerA.query("select * from cola_tomar_uno('worker-a')"),
        workerB.query("select * from cola_tomar_uno('worker-b')"),
      ]);
      const filaA = resA.rows[0];
      const filaB = resB.rows[0];
      const idsTomo = [filaA, filaB].filter((f) => f && f.id).map((f) => f.id);

      assert(idsTomo.length === 1, "solo uno de los dos workers se llevó el trabajo pendiente");
      assert(
        idsTomo[0] === jobId,
        "el trabajo que se llevó es el que insertamos (no otro que haya quedado suelto)"
      );
    } finally {
      await workerA.end();
      await workerB.end();
    }
  } finally {
    // Limpieza manual: esta prueba no puede vivir en una sola transacción
    // (necesita dos sesiones reales para que SKIP LOCKED tenga sentido).
    if (jobId) await admin.query("delete from cola_trabajos where id = $1", [jobId]);
    await admin.query("delete from conversaciones where cliente_id in (select id from clientes where telefono = '+549000000002')");
    await admin.query("delete from clientes where telefono = '+549000000002'");
    await admin.end();
  }
}

async function testRlsCeroFilas() {
  console.log("\n[3/3] RLS: anon y usuario sin perfil aprobado ven cero filas");
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    await client.query("begin");

    await client.query("set local role anon");
    const comoAnon = await client.query("select count(*)::int as n from clientes");
    assert(comoAnon.rows[0].n === 0, "anon ve 0 filas en clientes");

    await client.query("reset role");
    await client.query("set local role authenticated");
    await client.query(
      "set local request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-000000000000\",\"role\":\"authenticated\"}'"
    );
    const sinPerfil = await client.query("select count(*)::int as n from clientes");
    assert(sinPerfil.rows[0].n === 0, "usuario autenticado sin perfil aprobado ve 0 filas en clientes");

    const sinPerfilTurnos = await client.query("select count(*)::int as n from turnos");
    assert(sinPerfilTurnos.rows[0].n === 0, "usuario autenticado sin perfil aprobado ve 0 filas en turnos");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

(async () => {
  console.log("Controles de Fase 0 — otto-agente\n" + "=".repeat(40));
  try {
    await testIdempotenciaWebhook();
    await testColaSkipLocked();
    await testRlsCeroFilas();
  } catch (err) {
    console.error("\n💥 Error inesperado corriendo los tests:", err);
    fallas++;
  }
  console.log("\n" + "=".repeat(40));
  if (fallas > 0) {
    console.error(`❌ ${fallas} control(es) no pasaron.`);
    process.exit(1);
  }
  console.log("✅ Todos los controles de Fase 0 pasaron.");
})();
