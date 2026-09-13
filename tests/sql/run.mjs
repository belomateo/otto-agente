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
    // Esta prueba no puede correr adentro de una transacción, así que si una
    // corrida anterior murió a mitad de camino quedan filas con este teléfono y
    // el insert de abajo fallaría por el unique de `clientes.telefono` para
    // siempre. Se limpia primero (cascada borra conversaciones y cola_trabajos).
    await admin.query("delete from clientes where telefono = '+549000000002'");
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
    // El try anidado es para que la conexión se cierre igual si un delete falla;
    // si no, el proceso se queda colgado con la conexión abierta.
    try {
      if (jobId) await admin.query("delete from cola_trabajos where id = $1", [jobId]);
      // borrar el cliente arrastra en cascada conversaciones y cola_trabajos
      await admin.query("delete from clientes where telefono = '+549000000002'");
    } finally {
      await admin.end();
    }
  }
}

async function testRlsCeroFilas() {
  console.log("\n[3/3] RLS: anon y usuario sin perfil aprobado ven cero filas");
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    await client.query("begin");

    // Con las tablas vacías, "ve 0 filas" lo cumple hasta una base sin RLS: la
    // prueba pasaría igual estando todo abierto. Así que primero se planta una
    // fila de cada tabla (dentro de la transacción, se va con el rollback) y se
    // confirma que el dueño de la tabla sí las ve. Recién ahí el 0 significa algo.
    const cli = await client.query(
      "insert into clientes (telefono, nombre) values ('+549000000003', 'Prueba RLS') returning id"
    );
    await client.query(
      `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin)
       values ($1, 'invitado', 45, 1, now() + interval '2 days', now() + interval '2 days 45 minutes')`,
      [cli.rows[0].id]
    );
    const comoDueno = await client.query("select count(*)::int as n from clientes");
    assert(comoDueno.rows[0].n > 0, "la fila de prueba existe (si no, el resto de la prueba no probaría nada)");

    await client.query("set local role anon");
    const comoAnon = await client.query("select count(*)::int as n from clientes");
    assert(comoAnon.rows[0].n === 0, "anon ve 0 filas en clientes (habiendo filas)");
    const anonTurnos = await client.query("select count(*)::int as n from turnos");
    assert(anonTurnos.rows[0].n === 0, "anon ve 0 filas en turnos (habiendo filas)");

    await client.query("reset role");
    await client.query("set local role authenticated");
    await client.query(
      "set local request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-000000000000\",\"role\":\"authenticated\"}'"
    );
    const sinPerfil = await client.query("select count(*)::int as n from clientes");
    assert(sinPerfil.rows[0].n === 0, "usuario autenticado sin perfil aprobado ve 0 filas en clientes");

    const sinPerfilTurnos = await client.query("select count(*)::int as n from turnos");
    assert(sinPerfilTurnos.rows[0].n === 0, "usuario autenticado sin perfil aprobado ve 0 filas en turnos");

    // Leer no es lo único que hay que cortar: anon y authenticated tienen GRANT
    // de INSERT/UPDATE/DELETE por defecto en Supabase, así que lo único que los
    // frena es el `with check` de la policy.
    let rechazado = false;
    await client.query("savepoint antes_del_insert");
    try {
      await client.query("insert into clientes (telefono) values ('+549000000004')");
    } catch (err) {
      rechazado = err.code === "42501"; // insufficient_privilege (violó la policy)
      await client.query("rollback to savepoint antes_del_insert");
    }
    assert(rechazado, "usuario autenticado sin perfil aprobado no puede insertar en clientes");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

// Hito 1.15: la ficha del cliente (AGENTE.md § 7), los enums que tienen que coincidir con
// las herramientas y el prompt (temas de AGENTE.md § 8, motivos de PROCESOS.md § 4) y el
// UPDATE de Storage. Todo dentro de una transacción con ROLLBACK.
const TEMAS = [
  "que-incluye", "como-funciona", "reserva-y-garantia", "ubicacion-horarios", "talles",
  "a-medida", "anticipacion", "accesorios", "objecion-precio", "objecion-turno",
  "objecion-competencia", "que-no-hacemos", "descuentos", "novio", "graduado", "invitado",
];
const MOTIVOS = [
  "reclamo", "prenda_danada", "corporativo", "turno_urgente_sin_hueco", "descuento",
  "dato_no_encontrado", "pide_persona", "barandilla_doble", "sin_respuesta", "timeout",
];
const EVENTOS = ["casamiento", "graduacion", "fiesta", "laboral", "otro"];
const ROLES = ["novio", "invitado", "graduado", "padre", "otro"];

async function testEsquemaDelAgente() {
  console.log("\n[1.15] Esquema del agente: ficha del cliente, enums y Storage");
  const client = new Client({ connectionString: CONN });
  await client.connect();

  // Corre la sentencia en un savepoint: devuelve el código de error (o null si entró) sin
  // abortar la transacción de la prueba.
  async function probar(sql, params = []) {
    await client.query("savepoint chequeo");
    try {
      await client.query(sql, params);
      await client.query("release savepoint chequeo");
      return null;
    } catch (err) {
      await client.query("rollback to savepoint chequeo");
      return err.code;
    }
  }
  async function todosEntran(valores, sql) {
    const fallan = [];
    for (const v of valores) if ((await probar(sql, [v])) !== null) fallan.push(v);
    return fallan;
  }

  try {
    await client.query("begin");
    const cli = await client.query(
      "insert into clientes (telefono, nombre) values ('+549000000005', 'Prueba ficha') returning id"
    );
    const id = cli.rows[0].id;
    const conv = await client.query("insert into conversaciones (cliente_id) values ($1) returning id", [id]);
    const convId = conv.rows[0].id;

    let fallan = await todosEntran(EVENTOS, `update clientes set evento = $1 where id = '${id}'`);
    assert(fallan.length === 0, `los ${EVENTOS.length} eventos del enum entran${fallan.length ? ` (fallan: ${fallan})` : ""}`);
    fallan = await todosEntran(ROLES, `update clientes set rol = $1 where id = '${id}'`);
    assert(fallan.length === 0, `los ${ROLES.length} roles del enum entran${fallan.length ? ` (fallan: ${fallan})` : ""}`);
    fallan = await todosEntran(MOTIVOS, `insert into derivaciones (conversacion_id, motivo) values ('${convId}', $1)`);
    assert(fallan.length === 0, `los ${MOTIVOS.length} motivos de derivación entran${fallan.length ? ` (fallan: ${fallan})` : ""}`);
    fallan = await todosEntran(TEMAS, "insert into fragmentos (tema, titulo, texto) values ($1, 'Prueba', 'texto de prueba')");
    assert(fallan.length === 0, `los ${TEMAS.length} temas de fragmentos entran${fallan.length ? ` (fallan: ${fallan})` : ""}`);

    // 23514 = check_violation
    assert((await probar(`update clientes set evento = 'boda' where id = '${id}'`)) === "23514", "un evento fuera del enum se rechaza");
    assert((await probar(`update clientes set rol = 'padrino' where id = '${id}'`)) === "23514", "un rol fuera del enum se rechaza");
    assert((await probar(`update clientes set dia_o_noche = 'tarde' where id = '${id}'`)) === "23514", "dia_o_noche fuera de dia/noche se rechaza");
    assert(
      (await probar(`insert into derivaciones (conversacion_id, motivo) values ('${convId}', 'queja')`)) === "23514",
      "un motivo de derivación fuera del enum se rechaza"
    );
    assert(
      (await probar("insert into fragmentos (tema, titulo, texto) values ('precios', 'Prueba', 'texto')")) === "23514",
      "un tema fuera de los 16 se rechaza"
    );

    const versionAntes = (await client.query("select version from clientes where id = $1", [id])).rows[0].version;
    await client.query("update clientes set talle_aprox = '52', editado_por = 'prueba' where id = $1", [id]);
    // Por versión y no por editado_at: dentro de una sola transacción now() es siempre el
    // mismo instante, así que todas las filas de historial de esta prueba empatan en la hora.
    const hist = await client.query(
      "select max(version) as v from historial_ediciones where tabla = 'clientes' and fila_id = $1",
      [id]
    );
    assert(hist.rows[0].v === versionAntes, "editar la ficha deja su fila de historial con la versión anterior");

    const pol = await client.query(
      `select count(*)::int as n from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'
         and policyname in ('catalogo_update_aprobados', 'adjuntos_update_aprobados')`
    );
    assert(pol.rows[0].n === 2, "Storage tiene policies de UPDATE en catalogo y adjuntos");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

(async () => {
  console.log("Controles de la base (Fase 0 + hito 1.15) — otto-agente\n" + "=".repeat(40));
  try {
    await testIdempotenciaWebhook();
    await testColaSkipLocked();
    await testRlsCeroFilas();
    await testEsquemaDelAgente();
  } catch (err) {
    console.error("\n💥 Error inesperado corriendo los tests:", err);
    fallas++;
  }
  console.log("\n" + "=".repeat(40));
  if (fallas > 0) {
    console.error(`❌ ${fallas} control(es) no pasaron.`);
    process.exit(1);
  }
  console.log("✅ Todos los controles pasaron.");
})();
