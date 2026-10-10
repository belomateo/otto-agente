// Arnés HTTP de los posibles feriados (0098, pedido de Mateo 10/10: «que en el calendario aparezcan
// los posibles feriados de Argentina, que Lucía no recomiende esas fechas, y que haya un botón de
// local abierto o cerrado»): PATCH /api/configuracion/feriados/[fecha] y lo que devuelve la agenda
// (GET /api/turnos y /api/turnos/mes), contra el panel de verdad (next start sobre el build) y la
// base real, con sesiones de usuarios de verdad. Como probar-turnos-equipo.mjs, no toca ninguna fila
// real: crea dos usuarios temporales (un admin y uno del equipo) y un posible feriado de prueba en
// una fecha lejana (2099, sembrado con service role); al terminar borra todo —el feriado, el cierre
// que dejó «Local cerrado» y los usuarios— y verifica que no quedó nada. No imprime claves ni
// contraseñas.
//
// Uso, desde la raíz del repo, con 0098 YA APLICADA y después de `npm run build` en panel/:
//   node tests/paneles/probar-feriados.mjs
// Necesita .env (SUPABASE_DB_URL) y panel/.env.local (URL, anon y service role de Supabase). Sin la
// tabla feriados_posibles corta en la preparación, sin escribir nada.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PANEL = RAIZ + "panel/";
const reqPanel = createRequire(PANEL + "package.json");
const reqRaiz = createRequire(RAIZ + "package.json");
const ENV_ORIGINAL = { ...process.env };
const dotenv = reqRaiz("dotenv");
dotenv.config({ path: RAIZ + ".env" });
dotenv.config({ path: PANEL + ".env.local" });
const { createClient } = reqPanel("@supabase/supabase-js");
const { createServerClient } = reqPanel("@supabase/ssr");
const pg = reqRaiz("pg");

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SB_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_DB_URL: DB_URL })) {
  if (!v) {
    console.error(`falta ${k}`);
    process.exit(1);
  }
}

// Un lunes lejano que no usa nadie (ni turnos, ni cierres, ni feriados reales: se verifica antes de
// escribir nada). El día siguiente, sin feriado, para el 404.
const FECHA = "2099-01-05";
const FECHA_SIN_FERIADO = "2099-01-06";
const MARCA = "PRUEBA paneles";
const NOMBRE = `${MARCA} feriado`;
// El motivo con que «Local cerrado» carga el cierre (decidirFeriado, panel/lib/queries/feriados.ts).
const MOTIVO = `Feriado · ${NOMBRE}`;

let fallas = 0;
let total = 0;
function ok(cond, msg) {
  total++;
  console.log(`  ${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) fallas++;
  return cond;
}
const seccion = (t) => console.log(`\n[${t}]`);

const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new pg.Client({ connectionString: DB_URL });
db.on("error", (e) => console.error("  ⚠️  se cortó la conexión de control:", e.message));
const q = async (s, p = []) => (await db.query(s, p)).rows;

// El panel, en un puerto libre (mismo criterio que probar-api.mjs: si otro lo gana, se reintenta).
const puertoLibre = () =>
  new Promise((res, rej) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
let BASE = "";
let hijo = null;
let log = "";
async function arrancarPanel() {
  for (let intento = 1; intento <= 3; intento++) {
    const puerto = await puertoLibre();
    log = "";
    hijo = spawn(process.execPath, [PANEL + "node_modules/next/dist/bin/next", "start", "-p", String(puerto)], {
      cwd: PANEL,
      env: ENV_ORIGINAL,
      stdio: ["ignore", "pipe", "pipe"],
    });
    hijo.stdout.on("data", (d) => (log += d));
    hijo.stderr.on("data", (d) => (log += d));
    BASE = `http://localhost:${puerto}`;
    for (let i = 0; i < 80 && hijo.exitCode === null; i++) {
      if (/Ready/.test(log)) {
        try {
          await fetch(BASE + "/login", { redirect: "manual" });
          return;
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (hijo.exitCode === null) throw new Error("el panel no arrancó");
    if (!/EADDRINUSE/.test(log)) throw new Error("el panel se cerró:\n" + log.slice(-2000));
  }
  throw new Error("el panel no consiguió un puerto libre en 3 intentos");
}
async function frenarPanel() {
  if (!hijo || hijo.exitCode !== null) return;
  await new Promise((r) => {
    hijo.once("exit", r);
    hijo.kill();
    setTimeout(r, 5000);
  });
}

// Sesión de verdad (cookies de @supabase/ssr), como la del navegador. Se cierran todas al final:
// la sesión también es residuo (hallazgo de logica del 21/9, ver probar-api.mjs).
const sesiones = [];
async function iniciarSesion(email, password) {
  const jar = new Map();
  const sb = createServerClient(SB_URL, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("no se pudo iniciar sesión: " + error.message);
  sesiones.push(sb);
  await new Promise((r) => setTimeout(r, 50));
  if (jar.size === 0) throw new Error("el inicio de sesión no dejó cookies");
  return { cookie: () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}
async function api(ses, metodo, ruta, cuerpo) {
  const headers = {};
  if (ses) headers.cookie = ses.cookie();
  let body;
  if (cuerpo !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }
  const r = await fetch(BASE + ruta, { method: metodo, headers, body, redirect: "manual" });
  const tipo = r.headers.get("content-type") || "";
  return { status: r.status, datos: tipo.includes("json") ? await r.json() : await r.text() };
}

// Usuarios temporales con el mismo patrón de mail y de nombre que probar-api.mjs: si algo quedara,
// su verificarLimpieza() también lo encuentra.
const SUFIJO = Date.now().toString(36);
const usuarios = [];
async function crearUsuario(etiqueta, rol) {
  const email = `paneles.${etiqueta}.${SUFIJO}@example.com`;
  const password = randomBytes(18).toString("base64url") + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: `${MARCA} ${etiqueta}` },
  });
  if (error) throw new Error(`no se pudo crear el usuario ${etiqueta}: ${error.message}`);
  usuarios.push(data.user);
  await q("update perfiles set rol = $2, estado = 'aprobado' where id = $1", [data.user.id, rol]);
  return { id: data.user.id, email, password };
}

// Todo lo que deja esta prueba. Va ANTES de borrar los usuarios: feriados_posibles.decidido_por y
// cierres_agenda.creado_por apuntan a sus perfiles. Cualquier cierre que haya creado un usuario de
// prueba es de prueba, sea de la fecha que sea (por si un error lo dejó en otra).
async function borrarPrueba() {
  await q("delete from cierres_agenda where (fecha = $1 and motivo = $2) or creado_por = any($3::uuid[])", [FECHA, MOTIVO, usuarios.map((u) => u.id)]);
  await q("delete from feriados_posibles where fecha = $1 and nombre = $2", [FECHA, NOMBRE]);
}

// Cómo quedó la fecha de prueba en la base (feriado + cierre), para comparar contra lo que dijo la API.
async function estadoEnLaBase() {
  const f = (await q("select local_abierto, decidido_por, decidido_at from feriados_posibles where fecha = $1", [FECHA]))[0];
  const c = await q("select motivo, creado_por from cierres_agenda where fecha = $1", [FECHA]);
  return {
    hay_feriado: Boolean(f),
    local_abierto: f?.local_abierto,
    decidido_por: f?.decidido_por ?? null,
    decidido_at: f?.decidido_at ?? null,
    cierres: c.length,
    motivo: c[0]?.motivo ?? null,
    creado_por: c[0]?.creado_por ?? null,
  };
}
const resumir = (e) => `local_abierto ${e.local_abierto}, cierres ${e.cierres}${e.motivo ? ` «${e.motivo}»` : ""}`;

// Sin la tabla no se escribió nada, y la limpieza (que la consulta) no tiene qué hacer.
let hayTabla = false;
try {
  await db.connect();
  seccion("Preparación");
  hayTabla = (await q("select to_regclass('public.feriados_posibles') is not null as hay"))[0].hay;
  if (!hayTabla) throw new Error("la base no tiene feriados_posibles: falta aplicar supabase/migrations/0098_feriados_sin_reserva_y_prendas.sql (no se escribió nada)");
  // Residuo de una corrida anterior que no llegó a limpiar (solo lo que lleva la marca de prueba).
  await borrarPrueba();
  // Las fechas de prueba tienen que estar vacías de datos reales: si no, no se toca nada.
  const ocupadas = (await q(
    `select (select count(*) from feriados_posibles where fecha = any($1::date[]))::int feriados,
            (select count(*) from cierres_agenda where fecha = any($1::date[]))::int cierres,
            (select count(*) from turnos where inicio >= '2099-01-04' and inicio < '2099-01-08')::int turnos`,
    [[FECHA, FECHA_SIN_FERIADO]]
  ))[0];
  if (ocupadas.feriados || ocupadas.cierres || ocupadas.turnos) {
    throw new Error(`las fechas de prueba tienen datos que no son de esta prueba (${JSON.stringify(ocupadas)}): no se toca nada`);
  }

  const A = await crearUsuario("feriados-admin", "admin");
  const E = await crearUsuario("feriados-equipo", "equipo");
  // Con service role, como lo carga 0098: la RLS de la tabla no deja insertar sino a un admin.
  const { error: eSembrar } = await admin.from("feriados_posibles").insert({ fecha: FECHA, nombre: NOMBRE });
  if (eSembrar) throw new Error("no se pudo sembrar el posible feriado de prueba: " + eSembrar.message);
  await arrancarPanel();
  const sa = await iniciarSesion(A.email, A.password);
  const se = await iniciarSesion(E.email, E.password);
  ok(true, `un admin y un 'equipo' temporales con sesión en el panel, y el posible feriado ${FECHA} sembrado`);

  seccion("Sin decidir: la agenda lo muestra como posible feriado");
  {
    const dia = await api(sa, "GET", `/api/turnos?fecha=${FECHA}`);
    ok(
      dia.status === 200 && dia.datos.feriado?.nombre === NOMBRE && dia.datos.feriado?.local_abierto === null && dia.datos.cierre === null,
      `la agenda del día trae feriado sin decidir y sin cierre (${dia.status}, ${JSON.stringify(dia.datos.feriado)})`
    );
    const diaEquipo = await api(se, "GET", `/api/turnos?fecha=${FECHA}`);
    ok(diaEquipo.status === 200 && diaEquipo.datos.feriado?.local_abierto === null, `el equipo también lo ve (RLS: lo lee cualquier aprobado) (${diaEquipo.status})`);
    const otroDia = await api(sa, "GET", `/api/turnos?fecha=${FECHA_SIN_FERIADO}`);
    ok(otroDia.status === 200 && otroDia.datos.feriado === null, `un día que no es feriado trae feriado: null (${otroDia.status}, ${JSON.stringify(otroDia.datos.feriado)})`);
    const mes = await api(sa, "GET", `/api/turnos/mes?desde=${FECHA.slice(0, 7)}`);
    const delMes = mes.datos.dias?.find((d) => d.fecha === FECHA);
    ok(
      mes.status === 200 && delMes?.feriado?.nombre === NOMBRE && delMes?.feriado?.local_abierto === null,
      `el mes también lo trae, sin decidir (${mes.status}, ${JSON.stringify(delMes?.feriado)})`
    );
  }

  seccion("Solo un admin decide");
  {
    const cerrar = await api(se, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: false });
    const abrir = await api(se, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: true });
    ok(cerrar.status === 403 && abrir.status === 403, `un 'equipo' no puede marcar «Local cerrado» ni «Local abierto» (${cerrar.status}, ${abrir.status})`);
    const sinSesion = await api(null, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: true });
    ok(sinSesion.status === 401, `sin sesión → 401 (${sinSesion.status})`);
    const e = await estadoEnLaBase();
    ok(e.local_abierto === null && e.decidido_por === null && e.cierres === 0, `y en la base no cambió nada (${resumir(e)})`);
  }

  seccion("Validación");
  {
    const malaFecha = await api(sa, "PATCH", "/api/configuracion/feriados/05-01-2099", { local_abierto: false });
    ok(malaFecha.status === 400, `fecha mal formada → 400 (${malaFecha.status})`);
    const sinCampo = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA}`, {});
    const texto = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: "si" });
    ok(sinCampo.status === 400 && texto.status === 400, `sin local_abierto, o que no sea true/false → 400 (${sinCampo.status}, ${texto.status})`);
    const deMas = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: true, nombre: "otro nombre" });
    ok(deMas.status === 400, `un campo de más (nombre) → 400: desde acá solo se decide abrir o cerrar (${deMas.status})`);
    const noEs = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA_SIN_FERIADO}`, { local_abierto: false });
    const cierresNoEs = (await q("select count(*)::int n from cierres_agenda where fecha = $1", [FECHA_SIN_FERIADO]))[0].n;
    ok(noEs.status === 404 && cierresNoEs === 0, `una fecha que no es posible feriado → 404, sin cerrar ese día (${noEs.status}, cierres ${cierresNoEs})`);
    const e = await estadoEnLaBase();
    ok(e.local_abierto === null && e.cierres === 0, `el feriado de prueba sigue sin decidir (${resumir(e)})`);
  }

  seccion("«Local cerrado»: local_abierto false y el día entra en cierres_agenda");
  {
    const r = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: false });
    ok(
      r.status === 200 && r.datos.feriado?.fecha === FECHA && r.datos.feriado?.local_abierto === false && r.datos.feriado?.decidido_por === A.id,
      `el admin marca «Local cerrado» → 200 con el feriado actualizado (${r.status}, ${JSON.stringify(r.datos.feriado ?? r.datos)})`
    );
    const e = await estadoEnLaBase();
    ok(e.local_abierto === false && e.decidido_por === A.id && e.decidido_at !== null, `en la base: local_abierto false, con quién y cuándo lo decidió (${resumir(e)})`);
    ok(e.cierres === 1 && e.motivo === MOTIVO && e.creado_por === A.id, `y el día quedó en cierres_agenda, a nombre del admin (${resumir(e)})`);
    const dia = await api(sa, "GET", `/api/turnos?fecha=${FECHA}`);
    ok(
      dia.status === 200 && dia.datos.feriado?.local_abierto === false && dia.datos.cierre?.motivo === MOTIVO,
      `la agenda del día lo trae cerrado (${dia.status}, feriado ${JSON.stringify(dia.datos.feriado)}, cierre ${JSON.stringify(dia.datos.cierre)})`
    );
    // Ya cerrado: no falla ni duplica el cierre (decidirFeriado deja el que está).
    const otraVez = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: false });
    const e2 = await estadoEnLaBase();
    ok(otraVez.status === 200 && e2.local_abierto === false && e2.cierres === 1 && e2.motivo === MOTIVO, `marcarlo cerrado otra vez no falla y deja el mismo cierre (${otraVez.status}, ${resumir(e2)})`);
  }

  seccion("«Local abierto»: local_abierto true y el cierre se va");
  {
    const r = await api(sa, "PATCH", `/api/configuracion/feriados/${FECHA}`, { local_abierto: true });
    ok(r.status === 200 && r.datos.feriado?.local_abierto === true && r.datos.feriado?.decidido_por === A.id, `el admin marca «Local abierto» → 200 (${r.status}, ${JSON.stringify(r.datos.feriado ?? r.datos)})`);
    const e = await estadoEnLaBase();
    ok(e.local_abierto === true && e.decidido_por === A.id && e.cierres === 0, `en la base: local_abierto true y ya no hay cierre ese día (${resumir(e)})`);
    const dia = await api(sa, "GET", `/api/turnos?fecha=${FECHA}`);
    ok(
      dia.status === 200 && dia.datos.feriado?.local_abierto === true && dia.datos.cierre === null,
      `la agenda del día lo trae abierto y sin cierre (${dia.status}, feriado ${JSON.stringify(dia.datos.feriado)}, cierre ${JSON.stringify(dia.datos.cierre)})`
    );
    const mes = await api(sa, "GET", `/api/turnos/mes?desde=${FECHA.slice(0, 7)}`);
    const delMes = mes.datos.dias?.find((d) => d.fecha === FECHA);
    ok(mes.status === 200 && delMes?.feriado?.local_abierto === true && delMes?.cierre === null, `el mes también (${mes.status}, ${JSON.stringify(delMes?.feriado)}, cierre ${JSON.stringify(delMes?.cierre)})`);
  }
} catch (e) {
  fallas++;
  console.error("\n💥", e?.stack || e);
  if (log) console.error("--- log del panel ---\n" + log.slice(-3000));
} finally {
  await frenarPanel();
  seccion("Limpieza");
  for (const sb of sesiones) await sb.auth.signOut().catch(() => {});
  if (hayTabla) {
    try {
      await borrarPrueba();
      for (const u of usuarios) {
        const { error } = await admin.auth.admin.deleteUser(u.id);
        if (error) console.error("  no se pudo borrar un usuario de prueba:", error.message);
      }
      const ids = usuarios.map((u) => u.id);
      const r = (await q(
        `select
          (select count(*) from feriados_posibles where nombre like $1)::int feriados,
          (select count(*) from cierres_agenda where motivo like $2 or creado_por = any($3::uuid[]))::int cierres,
          (select count(*) from perfiles where id = any($3::uuid[]))::int perfiles,
          (select count(*) from auth.users where id = any($3::uuid[]))::int usuarios`,
        [`${MARCA}%`, `Feriado · ${MARCA}%`, ids]
      ))[0];
      const restos = Object.entries(r).filter(([, n]) => n > 0);
      ok(restos.length === 0, `no quedó nada de la prueba en la base (${restos.map(([k, n]) => `${k}: ${n}`).join(", ") || "todo en 0"})`);
    } catch (e) {
      fallas++;
      console.error("💥 limpieza:", e?.stack || e);
    }
  }
  await db.end().catch(() => {});
}
console.log(`\n${"=".repeat(40)}\n${fallas ? "❌" : "✅"} ${total - fallas}/${total} aserciones`);
process.exit(fallas ? 1 : 0);
