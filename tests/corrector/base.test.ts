// La migración 0104 (corrector de Lucía, 10/10) contra la base real, adentro de una transacción que
// termina en rollback: se aplica (dos veces: es idempotente), se prueban los candados que cuidan que
// solo una versión probada al 100% llegue a activa, el cierre de una prueba (aplicar y rechazar) en
// las instrucciones, en una ficha y en una herramienta, y lo que puede y no puede hacer cada rol desde
// el panel. No queda nada: ni las tablas, ni las funciones, ni los datos.
//
// Necesita la base: sin SUPABASE_DB_URL queda ignorada (así `deno test tests/corrector` sin
// --env-file corre solo las pruebas puras). Correr:
//   env -u OPENAI_API_KEY timeout 280 deno test tests/corrector/base.test.ts --allow-all --env-file=.env --no-lock --node-modules-dir=none

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";

const URL_BASE = Deno.env.get("SUPABASE_DB_URL");
const MIGRACION = Deno.readTextFileSync(new URL("../../supabase/migrations/0104_corrector_de_lucia.sql", import.meta.url));
// Un texto que pasa el piso de la tabla (2000 caracteres): acá no se prueban los controles del código.
const TEXTO = `Sos Lucía, de prueba.\n${"Una línea de instrucciones de prueba.\n".repeat(80)}`;

type Sql = pg.Client;

// La migración se aplica UNA vez por corrida (dos veces seguidas: es idempotente) y cada escenario
// corre adentro de un savepoint que se deshace al terminar, así no se ven entre sí. Una sola tanda de
// DDL a propósito: otras pruebas de la misma base aplican migraciones en sus transacciones y cada
// tanda puede quedar esperando un candado (lock timeout el 11/10, con 7 tandas seguidas).
const ESCENARIOS: { nombre: string; fn: (sql: Sql) => Promise<void> }[] = [];
const prueba = (nombre: string, fn: (sql: Sql) => Promise<void>) => ESCENARIOS.push({ nombre, fn });

const esContencion = (e: unknown) => /deadlock|lock timeout|ENOTFOUND|connection error/i.test(String((e as Error)?.message ?? e));

async function abrir(): Promise<Sql> {
  const sql = new pg.Client({ connectionString: URL_BASE });
  await sql.connect();
  await sql.query("begin");
  // Que una espera por un candado no deje colgada la prueba (la base es la de producción).
  await sql.query("set local lock_timeout = '60s'");
  await sql.query(MIGRACION);
  await sql.query(MIGRACION); // idempotente
  return sql;
}

// Una sentencia que tiene que fallar, sin romper la transacción: savepoint y vuelta atrás.
async function falla(sql: Sql, q: string, valores: unknown[] = []): Promise<{ code: string; message: string }> {
  await sql.query("savepoint s");
  try {
    await sql.query(q, valores);
  } catch (e) {
    await sql.query("rollback to savepoint s");
    const err = e as { code: string; message: string };
    return { code: err.code, message: err.message };
  }
  await sql.query("release savepoint s");
  throw new Error(`se esperaba que fallara: ${q.slice(0, 80)}`);
}

const uno = async <T = Record<string, unknown>>(sql: Sql, q: string, v: unknown[] = []) => (await sql.query(q, v)).rows[0] as T;

async function nuevaCorreccion(sql: Sql, destino: string, cambio: unknown, pruebas: string[]): Promise<string> {
  const { id } = await uno<{ id: string }>(
    sql,
    `insert into correcciones_lucia (pedido, estado, analisis, opcion, destino, cambio, pedida_por)
     values ('pedido de prueba', 'probando', '{}'::jsonb, 'editar', $1, $2::jsonb, 'prueba@ejemplo.com') returning id::text as id`,
    [destino, JSON.stringify(cambio)],
  );
  let orden = 0;
  for (const estado of pruebas) {
    await sql.query(
      `insert into correcciones_pruebas (correccion_id, orden, nombre, mensajes, debe, estado)
       values ($1, $2, 'charla de prueba', '["hola"]'::jsonb, '["contesta"]'::jsonb, $3)`,
      [id, ++orden, estado],
    );
  }
  return id;
}

async function borrador(sql: Sql, correccion: string | null, version: number, base: { origen: string; version: number | null; hash?: string | null }) {
  await sql.query(
    `insert into instrucciones_lucia (version, texto, estado, correccion_id, resumen, base_origen, base_version, hash_archivo, creada_por)
     values ($1, $2, 'borrador', $3, 'cambio de prueba', $4, $5, $6, 'prueba@ejemplo.com')`,
    [version, TEXTO, correccion, base.origen, base.version, base.hash ?? null],
  );
}

const aplicar = (sql: Sql, id: string, hash = "huella-del-archivo") =>
  uno<{ r: { aplicada: boolean; motivo?: string; version?: number } }>(sql, "select corrector_aplicar($1, 'prueba@ejemplo.com', $2) as r", [id, hash]).then((f) => f.r);

const estadoDe = (sql: Sql, id: string) => uno<{ estado: string; resultado: string | null }>(sql, "select estado, resultado from correcciones_lucia where id = $1", [id]);

const activa = (sql: Sql) => uno<{ version: number } | undefined>(sql, "select version from instrucciones_lucia where estado = 'activa'");

prueba("instrucciones: sin el 100% no se activa nada; con el 100% sí, y la anterior queda reemplazada", async (sql) => {
  // 2 de 3: la segunda llave (corrector_aplicar) no deja aunque el código se equivoque.
  const c1 = await nuevaCorreccion(sql, "instrucciones", { instrucciones: { version: 1 } }, ["paso", "paso", "fallo"]);
  await borrador(sql, c1, 1, { origen: "archivo", version: null, hash: "huella-del-archivo" });
  const e1 = await falla(sql, "select corrector_aplicar($1, 'x', 'huella-del-archivo')", [c1]);
  assertEquals(e1.code, "23514");
  assertEquals(await activa(sql), undefined);

  // Dos charlas, las dos bien: tampoco (hacen falta al menos tres).
  const c0 = await nuevaCorreccion(sql, "instrucciones", { instrucciones: { version: 9 } }, ["paso", "paso"]);
  await borrador(sql, c0, 9, { origen: "archivo", version: null, hash: "huella-del-archivo" });
  assertEquals((await falla(sql, "select corrector_aplicar($1, 'x', 'huella-del-archivo')", [c0])).code, "23514");

  await sql.query("update correcciones_pruebas set estado = 'paso' where correccion_id = $1", [c1]);
  const r = await aplicar(sql, c1);
  assertEquals([r.aplicada, r.version], [true, 1]);
  assertEquals((await estadoDe(sql, c1)).estado, "aplicada");
  assertEquals((await activa(sql))?.version, 1);

  // La segunda, armada sobre la versión 1, la reemplaza.
  const c2 = await nuevaCorreccion(sql, "instrucciones", { instrucciones: { version: 2 } }, ["paso", "paso", "paso"]);
  await borrador(sql, c2, 2, { origen: "corrector", version: 1 });
  assertEquals((await aplicar(sql, c2)).aplicada, true);
  assertEquals((await activa(sql))?.version, 2);
  const v1 = await uno<{ estado: string; motivo: string }>(sql, "select estado, motivo_desactivacion as motivo from instrucciones_lucia where version = 1");
  assertEquals(v1.estado, "reemplazada");
  assert(v1.motivo.includes("versión 2"));
});

prueba("instrucciones: si mientras se probaba se aplicó otra (o se publicó otro archivo), se rechaza con el porqué", async (sql) => {
  const vieja = await nuevaCorreccion(sql, "instrucciones", {}, ["paso", "paso", "paso"]);
  await borrador(sql, vieja, 1, { origen: "archivo", version: null, hash: "huella-del-archivo" });
  const otra = await nuevaCorreccion(sql, "instrucciones", {}, ["paso", "paso", "paso"]);
  await borrador(sql, otra, 2, { origen: "archivo", version: null, hash: "huella-del-archivo" });
  assertEquals((await aplicar(sql, vieja)).aplicada, true);

  // «otra» se armó sobre el archivo, pero ahora rige la versión 1.
  const r = await aplicar(sql, otra);
  assertEquals(r.aplicada, false);
  assert(r.motivo?.includes("cambiaron mientras se probaba"), r.motivo);
  assertEquals((await estadoDe(sql, otra)).estado, "rechazada");
  assertEquals((await uno<{ estado: string }>(sql, "select estado from instrucciones_lucia where version = 2")).estado, "rechazada");
  assertEquals((await activa(sql))?.version, 1);

  // Otro archivo publicado en el medio: tampoco.
  await sql.query("update instrucciones_lucia set estado = 'reemplazada' where estado = 'activa'");
  const tercera = await nuevaCorreccion(sql, "instrucciones", {}, ["paso", "paso", "paso"]);
  await borrador(sql, tercera, 3, { origen: "archivo", version: null, hash: "huella-vieja" });
  const r3 = await aplicar(sql, tercera, "huella-nueva");
  assertEquals(r3.aplicada, false);
  assert(r3.motivo?.includes("otro archivo"), r3.motivo);
});

prueba("candados de la tabla: una sola activa, y activa solo con la prueba aprobada", async (sql) => {
  await sql.query(
    `insert into instrucciones_lucia (version, texto, estado, resumen, base_origen, prueba_ok, activada_at)
     values (1, $1, 'activa', 'x', 'archivo', true, now())`,
    [TEXTO],
  );
  const dos = await falla(
    sql,
    `insert into instrucciones_lucia (version, texto, estado, resumen, base_origen, prueba_ok, activada_at)
     values (2, $1, 'activa', 'x', 'archivo', true, now())`,
    [TEXTO],
  );
  assertEquals(dos.code, "23505");
  await sql.query("update instrucciones_lucia set estado = 'reemplazada' where version = 1");
  await sql.query(
    `insert into instrucciones_lucia (version, texto, estado, resumen, base_origen, prueba_ok, activada_at)
     values (3, $1, 'rechazada', 'x', 'archivo', false, null)`,
    [TEXTO],
  );
  const sinPrueba = await falla(sql, "update instrucciones_lucia set estado = 'activa', activada_at = now() where version = 3");
  assertEquals(sinPrueba.code, "23514");
  // El piso de cordura: 47 caracteres no son instrucciones (pasó el 16/9 con prompt_base).
  const corto = await falla(
    sql,
    `insert into instrucciones_lucia (version, texto, resumen, base_origen) values (4, 'Sos Lucía, del archivo de prueba de 47 letras.', 'x', 'archivo')`,
  );
  assertEquals(corto.code, "23514");
  const base = await falla(sql, `insert into instrucciones_lucia (version, texto, resumen, base_origen) values (5, $1, 'x', 'corrector')`, [TEXTO]);
  assertEquals(base.code, "23514");
});

prueba("ficha: se escribe recién al aplicar, con la versión de cuando se armó; si la editaron en el medio, se rechaza", async (sql) => {
  const { id, version } = await uno<{ id: string; version: number }>(
    sql,
    `insert into fragmentos (tema, titulo, texto) values ('ubicacion-horarios', 'Ficha de prueba del corrector', 'Texto viejo.')
     returning id::text as id, version`,
  );
  const cambio = { ficha: { id, tema: "ubicacion-horarios", titulo: "Ficha de prueba del corrector", version, texto_nuevo: "Texto viejo. Texto nuevo." } };
  const c = await nuevaCorreccion(sql, "ficha", cambio, ["paso", "paso", "paso"]);
  assertEquals((await uno<{ texto: string }>(sql, "select texto from fragmentos where id = $1", [id])).texto, "Texto viejo.");
  assertEquals((await aplicar(sql, c)).aplicada, true);
  const f = await uno<{ texto: string; version: number; editado_por: string }>(sql, "select texto, version, editado_por from fragmentos where id = $1", [id]);
  assertEquals([f.texto, f.version, f.editado_por], ["Texto viejo. Texto nuevo.", version + 1, "prueba@ejemplo.com"]);
  // Queda en el historial, como cualquier edición del panel (volver a la versión anterior).
  assertEquals(Number((await uno<{ n: string }>(sql, "select count(*) as n from historial_ediciones where tabla = 'fragmentos' and fila_id = $1", [id])).n), 1);

  // Otra corrección armada sobre la versión vieja de la misma ficha: rechazada, y la ficha no cambia.
  const vieja = await nuevaCorreccion(sql, "ficha", { ficha: { ...cambio.ficha, texto_nuevo: "Pisado." } }, ["paso", "paso", "paso"]);
  const r = await aplicar(sql, vieja);
  assertEquals(r.aplicada, false);
  assert(r.motivo?.includes("cambió mientras se probaba"), r.motivo);
  assertEquals((await uno<{ texto: string }>(sql, "select texto from fragmentos where id = $1", [id])).texto, "Texto viejo. Texto nuevo.");

  // Ficha nueva.
  const nueva = await nuevaCorreccion(sql, "ficha", { ficha: { id: null, tema: "ubicacion-horarios", titulo: "Estacionamiento (prueba)", version: null, texto_nuevo: "No tenemos estacionamiento propio." } }, ["paso", "paso", "paso"]);
  assertEquals((await aplicar(sql, nueva)).aplicada, true);
  assertEquals(Number((await uno<{ n: string }>(sql, "select count(*) as n from fragmentos where titulo = 'Estacionamiento (prueba)' and activo")).n), 1);
});

prueba("herramienta: la descripción se escribe al aplicar, solo si nadie la cambió mientras tanto", async (sql) => {
  const { version } = await uno<{ version: number }>(sql, "select version from herramientas_agente where nombre = 'enviar_link'");
  const c = await nuevaCorreccion(sql, "herramienta", { herramienta: { nombre: "enviar_link", version, texto_nuevo: "Descripción de prueba del corrector." } }, ["paso", "paso", "paso"]);
  assertEquals((await aplicar(sql, c)).aplicada, true);
  const h = await uno<{ descripcion: string; editado_por: string }>(sql, "select descripcion, editado_por from herramientas_agente where nombre = 'enviar_link'");
  assertEquals([h.descripcion, h.editado_por], ["Descripción de prueba del corrector.", "prueba@ejemplo.com"]);
  const vieja = await nuevaCorreccion(sql, "herramienta", { herramienta: { nombre: "enviar_link", version, texto_nuevo: "Pisado." } }, ["paso", "paso", "paso"]);
  assertEquals((await aplicar(sql, vieja)).aplicada, false);
});

prueba("rechazar: la corrección y su borrador quedan rechazados y lo que no corrió, salteado; dos veces no hace nada", async (sql) => {
  const c = await nuevaCorreccion(sql, "instrucciones", {}, ["paso", "fallo", "pendiente"]);
  await borrador(sql, c, 1, { origen: "archivo", version: null });
  assertEquals((await uno<{ r: boolean }>(sql, "select corrector_rechazar($1, 'falló la charla 2') as r", [c])).r, true);
  const e = await uno<{ estado: string; resultado: string; total: number; ok: number }>(
    sql,
    "select estado, resultado, pruebas_total as total, pruebas_ok as ok from correcciones_lucia where id = $1",
    [c],
  );
  assertEquals([e.estado, e.resultado, e.total, e.ok], ["rechazada", "falló la charla 2", 3, 1]);
  assertEquals((await uno<{ estado: string }>(sql, "select estado from instrucciones_lucia where correccion_id = $1", [c])).estado, "rechazada");
  assertEquals((await uno<{ estado: string }>(sql, "select estado from correcciones_pruebas where correccion_id = $1 and orden = 3", [c])).estado, "salteada");
  assertEquals((await uno<{ r: boolean }>(sql, "select corrector_rechazar($1, 'otra vez') as r", [c])).r, false);
});

// Un admin y alguien del equipo de verdad (sus ids, nada más: todo se deshace al final).
async function perfil(sql: Sql, rol: "admin" | "equipo"): Promise<{ id: string } | undefined> {
  return await uno<{ id: string }>(
    sql,
    "select id::text as id from perfiles where rol = $1 and estado = 'aprobado' and debe_cambiar_clave = false limit 1",
    [rol],
  );
}

async function como(sql: Sql, id: string) {
  await sql.query("set local role authenticated");
  await sql.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", email: "admin@ejemplo.com" })]);
}

async function deVuelta(sql: Sql) {
  await sql.query("reset role");
  await sql.query("select set_config('request.jwt.claims', '', true)");
}

prueba("panel: el admin lee y vuelve atrás (a una versión o al archivo); nadie escribe directo; el equipo no ve nada", async (sql) => {
  const admin = await perfil(sql, "admin");
  assert(admin, "hace falta un admin aprobado en perfiles para esta prueba");
  // v1 reemplazada (estuvo activa), v2 activa, v3 rechazada.
  await sql.query(
    `insert into instrucciones_lucia (version, texto, estado, resumen, base_origen, base_version, prueba_ok, activada_at, hash_archivo) values
       (1, $1, 'reemplazada', 'primera', 'archivo', null, true, now(), 'h1'),
       (2, $1, 'activa', 'segunda', 'corrector', 1, true, now(), 'h1'),
       (3, $1, 'rechazada', 'tercera', 'corrector', 1, false, null, 'h1')`,
    [TEXTO],
  );

  await como(sql, admin.id);
  assertEquals(Number((await uno<{ n: string }>(sql, "select count(*) as n from instrucciones_lucia")).n), 3);
  assertEquals((await falla(sql, "update instrucciones_lucia set estado = 'reemplazada' where version = 2")).code, "42501");
  assertEquals((await falla(sql, "insert into correcciones_lucia (pedido, analisis) values ('hola mundo', '{}')")).code, "42501");
  assertEquals((await falla(sql, "select corrector_aplicar(gen_random_uuid(), 'x', 'y')")).code, "42501");
  // A una que nunca estuvo activa no se vuelve.
  assertEquals((await falla(sql, "select instrucciones_volver(3)")).code, "22023");
  const r = await uno<{ r: { vigente: string; version: number } }>(sql, "select instrucciones_volver(1) as r");
  assertEquals([r.r.vigente, r.r.version], ["corrector", 4]);
  await deVuelta(sql);
  const v4 = await uno<{ estado: string; restaurada_de: number; base_origen: string; creada_por: string }>(
    sql,
    "select estado, restaurada_de, base_origen, creada_por from instrucciones_lucia where version = 4",
  );
  assertEquals([v4.estado, v4.restaurada_de, v4.base_origen, v4.creada_por], ["activa", 1, "archivo", "admin@ejemplo.com"]);
  assertEquals((await uno<{ estado: string }>(sql, "select estado from instrucciones_lucia where version = 2")).estado, "reemplazada");

  await como(sql, admin.id);
  const archivo = await uno<{ r: { vigente: string; cambio: boolean } }>(sql, "select instrucciones_volver(null) as r");
  assertEquals([archivo.r.vigente, archivo.r.cambio], ["archivo", true]);
  await deVuelta(sql);
  assertEquals(await activa(sql), undefined);

  // Descartar: solo una abierta.
  const c = await nuevaCorreccion(sql, "instrucciones", {}, ["pendiente", "pendiente", "pendiente"]);
  await como(sql, admin.id);
  assertEquals((await uno<{ r: boolean }>(sql, "select correccion_descartar($1) as r", [c])).r, true);
  assertEquals((await falla(sql, "select correccion_descartar($1)", [c])).code, "55000");
  await deVuelta(sql);
  assertEquals((await estadoDe(sql, c)).estado, "descartada");

  const equipo = await perfil(sql, "equipo");
  if (equipo) {
    await como(sql, equipo.id);
    assertEquals(Number((await uno<{ n: string }>(sql, "select count(*) as n from instrucciones_lucia")).n), 0);
    assertEquals(Number((await uno<{ n: string }>(sql, "select count(*) as n from correcciones_lucia")).n), 0);
    assertEquals((await falla(sql, "select instrucciones_volver(null)")).code, "42501");
    assertEquals((await falla(sql, "select correccion_descartar(gen_random_uuid())")).code, "42501");
    await deVuelta(sql);
  }
});

Deno.test({
  name: "0104 contra la base real (en una transacción que se deshace)",
  ignore: !URL_BASE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    // Contención con otras pruebas de la misma base: se reintenta una vez (contencion-base-compartida).
    let sql: Sql;
    try {
      sql = await abrir();
    } catch (e) {
      if (!esContencion(e)) throw e;
      console.warn(`   (la base estaba ocupada: ${String((e as Error).message)}; se reintenta una vez)`);
      sql = await abrir();
    }
    try {
      for (const e of ESCENARIOS) {
        await t.step(e.nombre, async () => {
          await sql.query("savepoint escenario");
          try {
            await e.fn(sql);
          } finally {
            await sql.query("rollback to savepoint escenario");
            await sql.query("reset role");
          }
        });
      }
    } finally {
      await sql.query("rollback").catch(() => {});
      await sql.end();
    }
  },
});
