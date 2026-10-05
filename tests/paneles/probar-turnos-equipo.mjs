// Solo la parte de Turnos para todo el equipo (turnos-equipo.mjs), contra el panel de verdad (next
// start sobre el build) y la base real. A diferencia de probar-api.mjs, no toca ninguna fila real
// (ni la reserva de urgencia, ni el prompt, ni la configuración): se puede correr con Lucía
// atendiendo. Crea un usuario 'equipo' temporal y sus propios clientes y turnos de 2031, y borra
// todo al terminar. No imprime claves ni contraseñas.
//
// Uso, desde la raíz del repo y después de `npm run build` en panel/:
//   node tests/paneles/probar-turnos-equipo.mjs
// Necesita .env (SUPABASE_DB_URL) y panel/.env.local (URL, anon y service role de Supabase).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { probarTurnosEquipo } from "./turnos-equipo.mjs";

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

// Sesión de verdad (cookies de @supabase/ssr), como la del navegador. Se cierra al final.
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

let usuario = null;
try {
  await db.connect();
  seccion("Preparación");
  const email = `paneles.turnos-equipo.${Date.now().toString(36)}@example.com`;
  const password = randomBytes(18).toString("base64url") + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: "PRUEBA turnos equipo" },
  });
  if (error) throw new Error(`no se pudo crear el usuario: ${error.message}`);
  usuario = data.user;
  await q("update perfiles set rol = 'equipo', estado = 'aprobado' where id = $1", [usuario.id]);
  await arrancarPanel();
  const sesion = await iniciarSesion(email, password);
  ok(true, "un usuario 'equipo' temporal, aprobado, con sesión en el panel");

  await probarTurnosEquipo({ api, q, ok, seccion, sesion, email });
} catch (e) {
  fallas++;
  console.error("\n💥", e?.stack || e);
  if (log) console.error("--- log del panel ---\n" + log.slice(-3000));
} finally {
  await frenarPanel();
  seccion("Limpieza");
  for (const sb of sesiones) await sb.auth.signOut().catch(() => {});
  if (usuario) {
    const { error } = await admin.auth.admin.deleteUser(usuario.id);
    if (error) console.error("  no se pudo borrar el usuario de prueba:", error.message);
    const quedan = (await q("select count(*)::int n from perfiles where id = $1", [usuario.id]).catch(() => [{ n: -1 }]))[0].n;
    ok(quedan === 0, `el usuario de prueba ya no está (${quedan})`);
  }
  await db.end().catch(() => {});
}
console.log(`\n${"=".repeat(40)}\n${fallas ? "❌" : "✅"} ${total - fallas}/${total} aserciones`);
process.exit(fallas ? 1 : 0);
