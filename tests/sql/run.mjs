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
  // El trigger de 0020 dispara el worker desplegado al encolar: si lo hiciera acá, ese worker
  // se llevaría el trabajo antes que los dos de prueba. Interruptor solo para esta sesión.
  await admin.query("set otto.sin_disparo = 'on'");
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
  "reclamo", "prenda_danada", "corporativo", "turno_urgente_sin_hueco", "evento_inminente",
  "descuento", "dato_no_encontrado", "pide_persona", "barandilla_doble", "sin_respuesta",
  "timeout",
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

    // 0025 sumó el UPDATE en los dos buckets (reemplazar una foto por la misma ruta).
    // 0041 pasó el bucket `catalogo` a solo-admin, porque lo lee todo internet; `adjuntos` es
    // privado y del trabajo diario, así que sigue en cualquier aprobado.
    const pol = await client.query(
      `select policyname, coalesce(qual, '') as usando from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'
         and policyname in ('catalogo_update_admin', 'adjuntos_update_aprobados')`
    );
    assert(pol.rows.length === 2, `Storage tiene policies de UPDATE en catalogo y adjuntos (${pol.rows.map((r) => r.policyname).join(", ")})`);
    const cat = pol.rows.find((r) => r.policyname === "catalogo_update_admin");
    const adj = pol.rows.find((r) => r.policyname === "adjuntos_update_aprobados");
    assert(
      cat?.usando.includes("es_admin") && adj?.usando.includes("es_usuario_aprobado"),
      "0041: el catálogo lo reemplaza solo un admin, adjuntos sigue siendo del equipo"
    );
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

// Hito 2.1: un solo turno por charla (0027). Como testColaSkipLocked, con sesiones reales: un
// worker no se lleva el trabajo de una charla que otro está atendiendo pero sí el de otra charla,
// y dos que eligen la misma charla a la vez no la toman los dos. cola_absorber (en una
// transacción con ROLLBACK) deja hechos solo los trabajos de los mensajes de texto de la ráfaga.
async function testColaPorCharla() {
  console.log("\n[2.1] Cola: un solo turno por charla, y la ráfaga absorbe sus trabajos");
  const TELS = ["5490000000211", "5490000000212", "5490000000213"];
  const admin = new Client({ connectionString: CONN });
  await admin.connect();
  await admin.query("set otto.sin_disparo = 'on'");
  // borrar el cliente arrastra en cascada conversaciones, mensajes y cola_trabajos
  const limpiar = () => admin.query("delete from clientes where telefono = any($1)", [TELS]);
  const registrar = (wamid, tel, texto) =>
    admin.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), '{}'::jsonb)", [wamid, tel, texto]);
  const charla = async (tel) =>
    (await admin.query("select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1", [tel])).rows[0].id;
  const workers = [];
  try {
    await limpiar();
    const reales = (await admin.query("select count(*)::int as n from cola_trabajos where estado = 'pendiente'")).rows[0].n;
    if (reales > 0) throw new Error(`hay ${reales} trabajo(s) reales pendientes en la cola: esperá a que el worker los tome`);
    await registrar("wamid.T21-X1", TELS[0], "hola");
    await registrar("wamid.T21-X2", TELS[0], "quiero alquilar un traje");
    await registrar("wamid.T21-Y1", TELS[1], "hola");
    const [x, y] = [await charla(TELS[0]), await charla(TELS[1])];

    for (let i = 0; i < 3; i++) {
      const w = new Client({ connectionString: CONN });
      await w.connect();
      workers.push(w);
    }
    const tomar = async (w, nombre) => (await w.query("select id, conversacion_id from cola_tomar_uno($1)", [nombre])).rows[0] ?? null;
    const a = await tomar(workers[0], "worker-a");
    assert(a?.conversacion_id === x, "el primer worker se lleva el trabajo más viejo (charla X)");
    const b = await tomar(workers[1], "worker-b");
    assert(b?.conversacion_id === y, "el segundo no toma el otro trabajo de X mientras X tiene un turno en curso: se lleva el de Y");
    assert((await tomar(workers[2], "worker-c")) === null, "un tercero no encuentra nada: lo que queda es de una charla con un turno en curso");
    await admin.query("select cola_terminar($1, true)", [a.id]);
    const c = await tomar(workers[2], "worker-c");
    assert(c?.conversacion_id === x, "cuando el turno de X termina, su trabajo siguiente ya se puede tomar");

    await registrar("wamid.T21-Z1", TELS[2], "hola");
    await registrar("wamid.T21-Z2", TELS[2], "precio?");
    const z = await charla(TELS[2]);
    const [r1, r2] = await Promise.all([tomar(workers[0], "worker-a"), tomar(workers[1], "worker-b")]);
    const deZ = [r1, r2].filter((r) => r?.conversacion_id === z).length;
    assert(deZ === 1, `dos workers a la vez sobre una charla con dos trabajos: la toma uno solo (${deZ})`);
  } finally {
    for (const w of workers) await w.end();
    await limpiar();
    await admin.end();
  }

  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local otto.sin_disparo = 'on'");
    const TEL = "5490000000214";
    const registrar = (wamid, tipo, texto, segundos, crudo = {}) =>
      client.query("select registrar_mensaje_entrante($1, $2, null, $3, $4, now() + make_interval(secs => $5), $6::jsonb)", [
        wamid,
        TEL,
        tipo,
        texto,
        segundos,
        JSON.stringify(crudo),
      ]);
    await registrar("wamid.T21-A1", "texto", "hola", -10);
    await registrar("wamid.T21-A2", "texto", "es para un casamiento", -5);
    await registrar("wamid.T21-A3", "button", "Confirmo", -5, { type: "button", button: { text: "Confirmo", payload: "CONFIRMO:x" } });
    await registrar("wamid.T21-A4", "texto", "y cuanto sale?", 60);
    const trabajos = async () =>
      (await client.query(
        `select t.id, m.contenido, t.estado from cola_trabajos t join mensajes m on m.id = (t.payload->>'mensaje_id')::uuid
          where m.conversacion_id = (select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1)
          order by m.enviado_at, m.contenido`,
        [TEL]
      )).rows;
    const primero = (await trabajos()).find((t) => t.contenido === "hola");
    const n = (await client.query("select cola_absorber($1, now()) as n", [primero.id])).rows[0].n;
    const estados = Object.fromEntries((await trabajos()).map((t) => [t.contenido, t.estado]));
    assert(
      n === 1 && estados["es para un casamiento"] === "hecho" && estados["Confirmo"] === "pendiente" && estados["y cuanto sale?"] === "pendiente",
      `cola_absorber: se lleva el otro texto de la ráfaga; no el botón ni el mensaje que llegó después (${JSON.stringify(estados)})`
    );
    const [texto] = (await client.query("select count(*)::int as n from mensajes where tipo = 'text'")).rows;
    assert(texto.n === 0, "no queda ningún mensaje con el tipo de Meta ('text'): la base dice 'texto'");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

// Hito 2.1: responder desde el panel (0028). mostrador_enviar guarda el mensaje con la marca y lo
// encola para el worker; solo con la charla tomada, dentro de las 24 hs y para un usuario
// aprobado. Transacción con ROLLBACK.
async function testMostrador() {
  console.log("\n[2.1] Responder desde el panel: mostrador_enviar");
  const client = new Client({ connectionString: CONN });
  await client.connect();
  const q = async (s, p = []) => (await client.query(s, p)).rows;
  const codigoDe = async (fn) => {
    await client.query("savepoint intento");
    try {
      await fn();
      return null;
    } catch (err) {
      return err.code;
    } finally {
      await client.query("rollback to savepoint intento");
    }
  };
  try {
    await client.query("begin");
    await client.query("set local otto.sin_disparo = 'on'");
    const TEL = "5490000000215";
    await q("select registrar_mensaje_entrante('wamid.T21-M1', $1, null, 'texto', 'hola, quiero hablar con alguien', now(), '{}'::jsonb)", [TEL]);
    const [{ id: conv }] = await q("select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1", [TEL]);
    const enviar = (texto, c = conv) => q("select mostrador_enviar($1, $2) as r", [c, texto]);

    assert((await codigoDe(() => enviar("hola"))) === "55000", "con Lucía atendiendo (charla activa) no se puede: primero hay que tomarla");
    await q("update conversaciones set estado = 'derivada' where id = $1", [conv]);
    assert((await codigoDe(() => enviar("hola", "00000000-0000-0000-0000-000000000000"))) === "P0002", "una charla que no existe: P0002");
    assert((await codigoDe(() => enviar("   "))) === "22023", "un texto vacío no se manda");
    const [{ r }] = await enviar("Hola, soy Ana del local");
    const [m] = await q("select contenido, direccion, wa_message_id from mensajes where id = $1", [r.mensaje_id]);
    const [t] = await q("select payload from cola_trabajos where payload->>'mensaje_id' = $1", [r.mensaje_id]);
    assert(
      m?.contenido === "[mostrador] Hola, soy Ana del local" && m.direccion === "saliente" && m.wa_message_id === null && t?.payload.tipo === "mostrador",
      "con la charla tomada: queda en la charla con la marca [mostrador] y encolado para el worker"
    );

    await q("update mensajes set enviado_at = now() - interval '25 hours' where conversacion_id = $1 and direccion = 'entrante'", [conv]);
    assert((await codigoDe(() => enviar("seguís ahí?"))) === "55000", "pasadas 24 hs del último mensaje del cliente, no: WhatsApp solo deja mandar una plantilla");
    await q("update mensajes set enviado_at = now() where conversacion_id = $1 and direccion = 'entrante'", [conv]);

    // Por la API, con la sesión de alguien que se registró pero no está aprobado.
    const sinAprobar = await codigoDe(async () => {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: "00000000-0000-0000-0000-00000000abcd", role: "authenticated" }),
      ]);
      await enviar("hola");
    });
    assert(sinAprobar === "42501", `un usuario sin aprobar no puede responder (${sinAprobar})`);
    const anon = await codigoDe(async () => {
      await client.query("set local role anon");
      await enviar("hola");
    });
    assert(anon === "42501", "anon ni siquiera puede llamarla");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

// Hito 1.11: lo que el webhook hace en la base (registrar_mensaje_entrante) y el ciclo de un
// trabajo en la cola (reintentos, tope de 3, rescate de trabados). Transacción con ROLLBACK.
async function testRegistroYCola() {
  console.log("\n[1.11] Webhook → cola: registro, dedup, derivadas, reintentos y rescate");
  const client = new Client({ connectionString: CONN });
  await client.connect();
  const TEL = "5490000000011";
  const registrar = async (wamid) =>
    (await client.query(
      "select registrar_mensaje_entrante($1, $2, 'Prueba 1.11', 'texto', 'hola', now(), '{}'::jsonb) as nuevo",
      [wamid, TEL]
    )).rows[0].nuevo;
  const contar = async (tabla) =>
    (await client.query(
      `select count(*)::int as n from ${tabla} t
         join conversaciones c on c.id = t.conversacion_id
         join clientes cl on cl.id = c.cliente_id
        where cl.telefono = $1`,
      [TEL]
    )).rows[0].n;
  const estado = async (id) => (await client.query("select estado, intentos from cola_trabajos where id = $1", [id])).rows[0];

  try {
    await client.query("begin");
    await client.query("set local otto.sin_disparo = 'on'");

    assert((await registrar("wamid.T111-1")) === true, "un mensaje nuevo se registra");
    assert((await registrar("wamid.T111-1")) === false, "el mismo wa_message_id otra vez se descarta (Meta reintentó)");
    assert((await contar("mensajes")) === 1 && (await contar("cola_trabajos")) === 1, "queda 1 mensaje y 1 trabajo en la cola");

    await registrar("wamid.T111-2");
    const convs = await client.query(
      "select count(*)::int as n from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1",
      [TEL]
    );
    assert(convs.rows[0].n === 1, "el segundo mensaje del mismo cliente va a la misma conversación abierta");

    await client.query(
      "update conversaciones set estado = 'derivada' where cliente_id = (select id from clientes where telefono = $1)",
      [TEL]
    );
    const colaAntes = await contar("cola_trabajos");
    await registrar("wamid.T111-3");
    assert(
      (await contar("mensajes")) === 3 && (await contar("cola_trabajos")) === colaAntes,
      "con la charla derivada, el mensaje se guarda pero Lucía no recibe trabajo"
    );

    const job = (await client.query(
      `select t.id from cola_trabajos t join conversaciones c on c.id = t.conversacion_id
         join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 limit 1`,
      [TEL]
    )).rows[0].id;
    await client.query("select cola_terminar($1, false, 'falla de prueba')", [job]);
    let e = await estado(job);
    assert(e.estado === "pendiente" && e.intentos === 1, "un trabajo que falla vuelve a pendiente con intentos = 1");
    await client.query("select cola_terminar($1, false, 'falla de prueba')", [job]);
    e = await estado(job);
    assert(e.estado === "error" && e.intentos === 2, "al segundo fallo queda en error (0044: dos intentos y después una persona)");
    const [der] = (await client.query(
      `select d.motivo, c.estado from derivaciones d join conversaciones c on c.id = d.conversacion_id
        where d.conversacion_id = (select conversacion_id from cola_trabajos where id = $1)`, [job])).rows;
    assert(der?.motivo === "fallo_tecnico" && der?.estado === "derivada",
      "al agotar los intentos la charla se deriva sola con motivo fallo_tecnico");

    await client.query(
      "update cola_trabajos set estado = 'procesando', intentos = 0, tomado_por = 'muerto', tomado_at = now() - interval '6 minutes' where id = $1",
      [job]
    );
    const rescatados = (await client.query("select cola_rescatar_trabados() as n")).rows[0].n;
    e = await estado(job);
    assert(
      rescatados >= 1 && e.estado === "pendiente" && e.intentos === 1,
      "un trabajo trabado en 'procesando' más de 5 min vuelve a pendiente"
    );

    await client.query("savepoint como_anon");
    let codigo = null;
    try {
      await client.query("set local role anon");
      await client.query("select registrar_mensaje_entrante('wamid.T111-X', '5490000000012', null, 'texto', 'x', now(), '{}'::jsonb)");
    } catch (err) {
      codigo = err.code;
    }
    await client.query("rollback to savepoint como_anon");
    assert(codigo === "42501", "anon no puede llamar a registrar_mensaje_entrante (sin permiso de ejecución)");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

// Hito 1.14: envíos por plantilla. A quién le toca cada envío (envios_pendientes), que no sale
// dos veces (envio_reservar / envio_terminar, con reintentos hasta 3), devuelto_at, la
// confirmación por botón y que el botón se encola aunque la charla esté derivada. Transacción
// con ROLLBACK; todo en 2030 con un "ahora" fijo, y el huso es el del negocio.
async function testEnviosProgramados() {
  console.log("\n[1.14] Envíos por plantilla: recordatorio, agradecimiento, recontactos y botón Confirmo");
  const client = new Client({ connectionString: CONN });
  await client.connect();
  const TZ = "America/Argentina/Cordoba";
  const AHORA = "2030-06-05T15:00:00-03:00"; // miércoles
  const q = async (s, p = []) => (await client.query(s, p)).rows;
  const pendientes = async (tipo, ahora = AHORA) =>
    (await q("select referencia from envios_pendientes($1, $2, $3)", [tipo, TZ, ahora])).map((r) => r.referencia);
  const cliente = async (tel) =>
    (await q("insert into clientes (telefono, nombre) values ($1, 'Prueba 1.14') returning id", [tel]))[0].id;
  const turno = async (clienteId, inicio, extra = {}) =>
    (await q(
      `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, confirmado, creado_at)
       values ($1, 'invitado', 45, $2, $3::timestamptz, $3::timestamptz + interval '45 minutes', $4, $5, coalesce($6::timestamptz, now()))
       returning id`,
      [clienteId, extra.probador ?? 1, inicio, extra.estado ?? "sin-confirmar", extra.confirmado ?? false, extra.creado ?? null]
    ))[0].id;
  const charla = async (clienteId, ultimoMensaje, estado = "activa") => {
    const id = (await q("insert into conversaciones (cliente_id, estado) values ($1, $2) returning id", [clienteId, estado]))[0].id;
    await q("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', 'hola', $2)", [id, ultimoMensaje]);
    return id;
  };

  try {
    await client.query("begin");
    await client.query("set local otto.sin_disparo = 'on'");

    // Recordatorio
    const a = await cliente("5490000001401");
    const t1 = await turno(a, "2030-06-06T08:00:00-03:00"); // a 17 hs: adentro de las 18
    const t2 = await turno(await cliente("5490000001402"), "2030-06-06T16:00:00-03:00"); // 25 hs
    // A 17,5 hs (adentro de la ventana): lo único que lo deja afuera es haberse reservado recién.
    const t3 = await turno(await cliente("5490000001403"), "2030-06-06T08:30:00-03:00", { probador: 3, creado: "2030-06-05T12:00:00-03:00" });
    const t4 = await turno(await cliente("5490000001404"), "2030-06-06T11:00:00-03:00", { estado: "confirmado", confirmado: true });
    let p = await pendientes("recordatorio_18h");
    assert(p.includes(t1) && !p.includes(t2) && !p.includes(t4), "recordatorio: sale para el turno sin confirmar que entró en las 18 hs, no para el de 25 hs ni el confirmado");
    assert(!p.includes(t3), "recordatorio: no sale para un turno reservado hace menos de 24 hs, aunque ya esté adentro de las 18 (le acaba de llegar la confirmación)");

    const id1 = (await q("select envio_reservar('recordatorio_18h', $1, $2, 'recordatorio_turno_18h') as id", [t1, a]))[0].id;
    const otra = (await q("select envio_reservar('recordatorio_18h', $1, $2, 'recordatorio_turno_18h') as id", [t1, a]))[0].id;
    assert(id1 && otra === null, "el mismo envío reservado dos veces: la segunda reserva no sale (unique en la base)");
    await q("select envio_terminar($1, true, 'wamid.T114-1', 'texto del recordatorio')", [id1]);
    const [marca] = await q("select recordatorio_enviado_at is not null as ok from turnos where id = $1", [t1]);
    const [enCharla] = await q(
      `select count(*)::int as n from mensajes m join conversaciones c on c.id = m.conversacion_id
        where c.cliente_id = $1 and m.direccion = 'saliente' and m.tipo = 'template' and m.wa_message_id = 'wamid.T114-1'`,
      [a]
    );
    const [ev] = await q(
      `select count(*)::int as n from eventos_agente e join conversaciones c on c.id = e.conversacion_id
        where c.cliente_id = $1 and e.detalle->>'etapa' = 'envio_programado' and e.detalle->>'tipo' = 'recordatorio_18h'`,
      [a]
    );
    assert(marca.ok && enCharla.n === 1 && ev.n === 1, "al salir: recordatorio_enviado_at, el mensaje en la charla del cliente y el evento en la bitácora");
    assert(!(await pendientes("recordatorio_18h")).includes(t1), "correr el cron otra vez no lo vuelve a mandar");

    // Reintentos: con Meta caída reintenta hasta 3 veces y después no más.
    // El de las 16:00 entra en las 18 hs a las 22:00, que cae afuera de la franja decente (0047):
    // el envío espera a las 9 de la mañana siguiente, que es el día del turno.
    const LUEGO = "2030-06-06T09:15:00-03:00";
    const b = (await q("select cliente_id from turnos where id = $1", [t2]))[0].cliente_id;
    assert((await pendientes("recordatorio_18h", LUEGO)).includes(t2), "el de las 16 entra a la mañana siguiente, no a las 22 (0047: no se escribe de madrugada)");
    for (let i = 1; i <= 3; i++) {
      const id = (await q("select envio_reservar('recordatorio_18h', $1, $2, 'recordatorio_turno_18h') as id", [t2, b]))[0].id;
      if (id) await q("select envio_terminar($1, false, null, 'texto', 'Meta respondió 500')", [id]);
    }
    const [e2] = await q("select estado, intentos from envios_programados where tipo = 'recordatorio_18h' and referencia = $1", [t2]);
    const sinMas = (await q("select envio_reservar('recordatorio_18h', $1, $2, 'recordatorio_turno_18h') as id", [t2, b]))[0].id;
    assert(e2.estado === "error" && e2.intentos === 3 && sinMas === null && !(await pendientes("recordatorio_18h", LUEGO)).includes(t2), "con Meta caída reintenta hasta 3 veces y después no insiste");

    // Agradecimiento
    const t5 = await turno(await cliente("5490000001405"), "2030-06-01T14:00:00-03:00", { probador: 2 });
    await q("update turnos set estado = 'devolvio' where id = $1", [t5]);
    const [dev] = await q("select devuelto_at is not null as ok from turnos where id = $1", [t5]);
    assert(dev.ok, "marcar 'devolvio' deja la hora en devuelto_at");
    await q("update turnos set devuelto_at = '2030-06-04T18:00:00-03:00' where id = $1", [t5]); // ayer
    const t6 = await turno(await cliente("5490000001406"), "2030-06-01T15:00:00-03:00", { probador: 2, estado: "devolvio" });
    await q("update turnos set devuelto_at = '2030-06-05T10:00:00-03:00' where id = $1", [t6]); // hoy
    const t7 = await turno(await cliente("5490000001407"), "2030-05-20T14:00:00-03:00", { probador: 2, estado: "devolvio" });
    await q("update turnos set devuelto_at = '2030-05-26T10:00:00-03:00' where id = $1", [t7]); // hace 10 días
    p = await pendientes("agradecimiento_resena");
    assert(p.includes(t5) && !p.includes(t6) && !p.includes(t7), "agradecimiento: al día siguiente de devolver; no el mismo día ni pasada una semana");

    // Recontactos
    const f = await cliente("5490000001408");
    const c1 = await charla(f, "2030-06-04T12:00:00-03:00"); // escribió ayer, sin turno
    const g = await cliente("5490000001409");
    const c2 = await charla(g, "2030-06-04T12:00:00-03:00");
    await turno(g, "2030-06-10T14:00:00-03:00", { probador: 3 }); // agendó en el medio
    const c3 = await charla(await cliente("5490000001410"), "2030-06-04T12:00:00-03:00", "derivada");
    p = await pendientes("recontacto_1");
    assert(p.includes(c1) && !p.includes(c2) && !p.includes(c3), "recontacto 1: al día siguiente de la consulta; no si agendó ni si la charla la tiene una persona");
    const i = await cliente("5490000001411");
    const c4 = await charla(i, "2030-06-02T12:00:00-03:00"); // hace tres días
    await q("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado) values ('recontacto_1', $1, $2, 'recontacto_turno_pendiente', 'enviado')", [c4, i]);
    const c5 = await charla(await cliente("5490000001412"), "2030-06-02T12:00:00-03:00"); // sin el primero
    p = await pendientes("recontacto_2");
    assert(p.includes(c4) && !p.includes(c5), "recontacto 2: a los tres días, solo si salió el primero");

    // Botón "Confirmo"
    const k = await cliente("5490000001413");
    const tK = await turno(k, "2030-06-12T14:00:00-03:00", { probador: 3 });
    const cK = (await q("insert into conversaciones (cliente_id) values ($1) returning id", [k]))[0].id;
    const confirmar = async (t, c) => (await q("select turno_confirmar_por_boton($1, $2) as r", [t, c]))[0].r;
    const r1 = await confirmar(tK, cK);
    const [tc] = await q("select estado, confirmado, confirmado_por from turnos where id = $1", [tK]);
    assert(r1 === "confirmado" && tc.estado === "confirmado" && tc.confirmado && tc.confirmado_por === "cliente", "el botón Confirmo confirma el turno, con confirmado_por = 'cliente'");
    assert((await confirmar(tK, cK)) === "ya_estaba", "tocarlo otra vez no cambia nada");
    const cA = (await q("select id from conversaciones where cliente_id = $1", [a]))[0].id;
    assert((await confirmar(tK, cA)) === "no_corresponde", "el botón de otro cliente no confirma un turno ajeno");

    // Con la charla derivada, el botón se encola igual; un "confirmo" escrito, no.
    const m = await cliente("5490000001414");
    const tM = await turno(m, "2030-06-12T15:00:00-03:00", { probador: 3 });
    await q("insert into conversaciones (cliente_id, estado) values ($1, 'derivada')", [m]);
    const colaDe = async () =>
      (await q(`select count(*)::int as n from cola_trabajos t join conversaciones c on c.id = t.conversacion_id where c.cliente_id = $1`, [m]))[0].n;
    await q("select registrar_mensaje_entrante('wamid.T114-TXT', '5490000001414', null, 'texto', 'confirmo', now(), $1::jsonb)", [
      JSON.stringify({ type: "text", text: { body: "confirmo" } }),
    ]);
    const conTexto = await colaDe();
    await q("select registrar_mensaje_entrante('wamid.T114-BTN', '5490000001414', null, 'button', 'Confirmo', now(), $1::jsonb)", [
      JSON.stringify({ type: "button", button: { text: "Confirmo", payload: `CONFIRMO:${tM}` } }),
    ]);
    assert(conTexto === 0 && (await colaDe()) === 1, "con la charla derivada, el botón Confirmo se encola y un 'confirmo' escrito no");

    let codigo = null;
    await client.query("savepoint como_anon");
    try {
      await client.query("set local role anon");
      await client.query("select * from envios_pendientes('recordatorio_18h', 'UTC')");
    } catch (err) {
      codigo = err.code;
    }
    await client.query("rollback to savepoint como_anon");
    assert(codigo === "42501", "anon no puede llamar a envios_pendientes");
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

(async () => {
  console.log("Controles de la base (Fase 0 + hitos 1.15, 1.11, 1.14 y 2.1) — otto-agente\n" + "=".repeat(40));
  try {
    await testIdempotenciaWebhook();
    await testColaSkipLocked();
    await testColaPorCharla();
    await testMostrador();
    await testRlsCeroFilas();
    await testEsquemaDelAgente();
    await testRegistroYCola();
    await testEnviosProgramados();
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
