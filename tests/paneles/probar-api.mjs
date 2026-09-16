// Arnés HTTP de paneles: los controles de H1.8, H1.9, H1.10 y H1.16 (y los de las decisiones #7
// y #9) contra el panel de verdad (next start sobre el build) y la base real, con sesiones de
// usuarios de verdad. Crea tres usuarios temporales (admin, nuevo, tercero) y datos marcados
// "PRUEBA paneles"; al terminar borra todo, restaura las filas reales que editó (ediciones con
// el mismo valor) y verifica que no quedó nada. No imprime claves ni contraseñas.
//
// Uso, desde la raíz del repo y después de `npm run build` en panel/:
//   node tests/paneles/probar-api.mjs
// Necesita .env (SUPABASE_DB_URL) y panel/.env.local (URL, anon y service role de Supabase).
// La base es la real que comparten los cuatro roles: solo escribe filas propias y las borra.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";

// Rutas relativas a este archivo (tests/paneles/ → raíz del repo).
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PANEL = RAIZ + "panel/";
const AQUI = fileURLToPath(new URL("./", import.meta.url));
const ENV_ORIGINAL = { ...process.env };
const reqPanel = createRequire(PANEL + "package.json");
const reqRaiz = createRequire(RAIZ + "package.json");
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

// Puerto libre elegido por el sistema: con uno fijo, otro servidor que ya lo ocupe contesta
// en lugar del nuestro (pasó con el 3107). Y entre que se elige y que el panel lo toma, otro
// proceso lo puede ganar (pasó el 15/9): cada arranque elige uno nuevo y reintenta.
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
const MARCA = "PRUEBA paneles";
const TEL = "+549000009901";
let fallas = 0;
let total = 0;
function ok(cond, msg) {
  total++;
  console.log(`  ${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) fallas++;
  return cond;
}
const seccion = (t) => console.log(`\n[${t}]`);
const tiene = (o, claves) => Boolean(o) && claves.every((k) => k in o);

const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new pg.Client({ connectionString: DB_URL });
const q = async (s, p = []) => (await db.query(s, p)).rows;

// ---------- panel ----------
// arrancarPanel solo arma el objeto; esperarPanel lanza el proceso y, si otro le ganó el puerto
// (EADDRINUSE), lo relanza en otro. El objeto es siempre el mismo y BASE apunta al que quedó.
function arrancarPanel(extra = {}) {
  return { extra, hijo: null, log: () => "" };
}
async function lanzar(p) {
  const puerto = await puertoLibre();
  const hijo = spawn(process.execPath, [PANEL + "node_modules/next/dist/bin/next", "start", "-p", String(puerto)], {
    cwd: PANEL,
    env: { ...ENV_ORIGINAL, ...p.extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  hijo.stdout.on("data", (d) => (log += d));
  hijo.stderr.on("data", (d) => (log += d));
  p.hijo = hijo;
  p.log = () => log;
  BASE = `http://localhost:${puerto}`;
}
async function esperarPanel(p) {
  for (let intento = 1; intento <= 3; intento++) {
    await lanzar(p);
    for (let i = 0; i < 80 && p.hijo.exitCode === null; i++) {
      // Solo cuenta si el que contesta es NUESTRO proceso (su log dice Ready).
      if (/Ready/.test(p.log())) {
        try {
          await fetch(BASE + "/login", { redirect: "manual" });
          return;
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (p.hijo.exitCode === null) throw new Error("el panel no arrancó");
    if (!/EADDRINUSE/.test(p.log())) throw new Error("el panel se cerró:\n" + p.log().slice(-2000));
    console.log(`  (otro proceso tomó el puerto en el medio: intento ${intento + 1})`);
  }
  throw new Error("el panel no consiguió un puerto libre en 3 intentos");
}
async function frenarPanel(p) {
  if (!p?.hijo || p.hijo.exitCode !== null) return;
  await new Promise((r) => {
    p.hijo.once("exit", r);
    p.hijo.kill();
    setTimeout(r, 5000);
  });
}

// ---------- sesiones ----------
async function iniciarSesion(email, password) {
  const jar = new Map();
  const sb = createServerClient(SB_URL, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("no se pudo iniciar sesión: " + error.message);
  await new Promise((r) => setTimeout(r, 50));
  if (jar.size === 0) throw new Error("el inicio de sesión no dejó cookies");
  const directo = createClient(SB_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { id: data.user.id, email, cookie: () => [...jar].map(([n, v]) => `${n}=${v}`).join("; "), directo };
}
async function api(ses, metodo, ruta, cuerpo) {
  const headers = {};
  if (ses) headers.cookie = ses.cookie();
  let body;
  if (cuerpo instanceof FormData) body = cuerpo;
  else if (cuerpo !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }
  const r = await fetch(BASE + ruta, { method: metodo, headers, body, redirect: "manual" });
  const tipo = r.headers.get("content-type") || "";
  const datos = tipo.includes("json") ? await r.json() : await r.text();
  return { status: r.status, tipo, datos, location: r.headers.get("location") || "" };
}

// ---------- usuarios y datos de prueba ----------
const SUFIJO = Date.now().toString(36);
const usuarios = {};
async function crearUsuario(etiqueta) {
  const email = `paneles.${etiqueta}.${SUFIJO}@example.com`;
  const password = randomBytes(18).toString("base64url") + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: `${MARCA} ${etiqueta}` },
  });
  if (error) throw new Error(`no se pudo crear el usuario ${etiqueta}: ${error.message}`);
  usuarios[etiqueta] = { id: data.user.id, email, password };
  return usuarios[etiqueta];
}

const creados = { filas: [], storage: [] };
let cli, conv, turnoId;
async function sembrar() {
  await q("delete from turnos where cliente_id in (select id from clientes where telefono = $1)", [TEL]);
  await q("delete from clientes where telefono = $1", [TEL]);
  cli = (await q(
    `insert into clientes (telefono, nombre, evento, fecha_evento, rol, talle_aprox, email)
     values ($1, $2, 'casamiento', '2031-01-20', 'invitado', '48', 'prueba.paneles@example.com') returning id`,
    [TEL, MARCA]
  ))[0].id;
  conv = (await q("insert into conversaciones (cliente_id, ultimo_mensaje_at) values ($1, now()) returning id", [cli]))[0].id;
  await q(
    `insert into mensajes (conversacion_id, direccion, contenido, enviado_at) values
       ($1, 'entrante', 'hola quiero alquilar un traje', now() - interval '5 minutes'),
       ($1, 'saliente', '¡Hola! Soy Lucía, asistente de Mr. Otto.', now() - interval '4 minutes'),
       ($1, 'entrante', 'para un casamiento', now() - interval '3 minutes')`,
    [conv]
  );
  await q(
    `insert into eventos_agente (conversacion_id, tipo, detalle) values
       ($1, 'herramienta', '{"herramienta":"consultar_catalogo","resumen":"PRUEBA paneles: consultó el catálogo"}'),
       ($1, 'ok', '{"barandilla":"precio_sin_herramienta","resumen":"PRUEBA paneles: rehecho"}')`,
    [conv]
  );
  await q("insert into derivaciones (conversacion_id, motivo) values ($1, 'turno_urgente_sin_hueco')", [conv]);
  turnoId = (await q(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin)
     values ($1, 'invitado', 45, 3, '2031-01-15T13:00:00Z', '2031-01-15T13:45:00Z') returning id`,
    [cli]
  ))[0].id;
  await q("insert into consumo_llm (conversacion_id, modelo, tokens_in, tokens_out, costo_usd) values ($1, 'prueba-paneles', 1000, 200, 0.0123)", [conv]);
}

// Filas reales que se editan con el mismo valor: se fotografían antes y se dejan como estaban.
const REALES = {
  contexto_agente: "clave = 'presentacion'",
  herramientas_agente: "nombre = 'anotar'",
  horarios: "dia_semana = 1",
  duraciones_turno: "tipo = 'novio'",
  configuracion_agenda: "true",
};
const fotos = {};
async function fotografiar() {
  for (const [tabla, where] of Object.entries(REALES)) {
    const fila = (await q(`select * from ${tabla} where ${where} limit 1`))[0];
    if (!fila) throw new Error(`falta la fila real de ${tabla}`);
    const hist = (await q("select id from historial_ediciones where fila_id = $1", [fila.id])).map((h) => h.id);
    fotos[tabla] = { fila, hist };
  }
}
async function restaurarReales() {
  for (const [tabla, { fila, hist }] of Object.entries(fotos)) {
    await db.query("begin");
    try {
      // Sin trigger de historial solo dentro de esta transacción: nadie más lo ve apagado.
      await db.query(`alter table ${tabla} disable trigger trg_historial`);
      const cols = Object.keys(fila).filter((c) => c !== "id");
      await db.query(`update ${tabla} set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`, [
        fila.id,
        ...cols.map((c) => fila[c]),
      ]);
      await db.query(`alter table ${tabla} enable trigger trg_historial`);
      await db.query("delete from historial_ediciones where fila_id = $1 and not (id = any($2::uuid[]))", [fila.id, hist]);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }
}
// Turnos creados fuera de sembrar() (H1.16, estados de Turnos): se borran con los del cliente
// de prueba (más abajo, por cliente_id); su historial, antes, porque la fila desaparece.
const turnosExtra = [];
async function limpiar() {
  if (turnosExtra.length) {
    await q("delete from historial_ediciones where tabla = 'turnos' and fila_id = any($1::uuid[])", [turnosExtra]);
  }
  // Primero la fila y después su historial: borrar una franja (0030) escribe historial.
  for (const { tabla, id } of creados.filas) {
    await q(`delete from ${tabla} where id = $1`, [id]);
    await q("delete from historial_ediciones where fila_id = $1", [id]);
  }
  if (creados.storage.length) {
    const { error } = await admin.storage.from("catalogo").remove(creados.storage);
    if (error) console.error("  no se pudo borrar de storage:", error.message);
  }
  if (cli) await q("delete from historial_ediciones where fila_id = any($1::uuid[])", [[cli, turnoId].filter(Boolean)]);
  await q("delete from turnos where cliente_id in (select id from clientes where telefono = $1)", [TEL]);
  await q("delete from consumo_llm where modelo = 'prueba-paneles'");
  await q("delete from clientes where telefono = $1", [TEL]);
  await restaurarReales();
  for (const u of Object.values(usuarios)) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.error("  no se pudo borrar un usuario de prueba:", error.message);
  }
}
async function verificarLimpieza() {
  const r = (await q(
    `select
      (select count(*) from clientes where telefono = $1)::int clientes,
      (select count(*) from catalogo_alquiler where modelo like 'PRUEBA paneles%')::int modelos,
      (select count(*) from accesorios_alquiler where nombre like 'PRUEBA paneles%')::int accesorios,
      (select count(*) from fragmentos where titulo like 'PRUEBA paneles%')::int fragmentos,
      (select count(*) from reglas_agente where texto like 'PRUEBA paneles%')::int reglas,
      (select count(*) from notas_dueno where texto like 'PRUEBA paneles%')::int notas,
      (select count(*) from enlaces where nombre like 'PRUEBA paneles%')::int enlaces,
      (select count(*) from prompt_base)::int prompt_base,
      (select count(*) from franjas_turnos where dia_semana = 0)::int franjas_domingo,
      (select count(*) from historial_ediciones where tabla = 'franjas_turnos' and datos_anteriores->>'borrado_por' like 'paneles.%@example.com')::int franjas_borradas,
      (select count(*) from consumo_llm where modelo = 'prueba-paneles')::int consumo,
      (select count(*) from historial_ediciones where editado_por like 'paneles.%@example.com')::int historial,
      (select count(*) from perfiles where nombre like 'PRUEBA paneles%')::int perfiles,
      (select count(*) from auth.users where email like 'paneles.%@example.com')::int usuarios`,
    [TEL]
  ))[0];
  const restos = Object.entries(r).filter(([, n]) => n > 0);
  ok(restos.length === 0, `no quedó nada de la prueba en la base (${restos.map(([k, n]) => `${k}: ${n}`).join(", ") || "todo en 0"})`);
  const reales = (await q("select count(*)::int n, count(*) filter (where version = 1)::int v1 from franjas_turnos"))[0];
  ok(reales.n === 7 && reales.v1 === 7, `las 7 franjas reales siguen en su v1 (${reales.n}, ${reales.v1} en v1)`);
  if (turnosExtra.length) {
    const t = (await q(
      `select (select count(*) from turnos where id = any($1::uuid[]))::int turnos,
              (select count(*) from historial_ediciones where fila_id = any($1::uuid[]))::int historial`,
      [turnosExtra]
    ))[0];
    ok(t.turnos === 0 && t.historial === 0, `no quedaron los turnos extra (aviso y estados) ni su historial (${t.turnos}, ${t.historial})`);
  }
  if (clientesSueltos.length) {
    const n = (await q("select count(*)::int n from clientes where id = any($1::uuid[])", [clientesSueltos]))[0].n;
    ok(n === 0, `no quedaron los clientes sueltos de Atención humana (${n})`);
  }
  for (const [tabla, { fila }] of Object.entries(fotos)) {
    const ahora = (await q(`select version, editado_por, editado_at from ${tabla} where id = $1`, [fila.id]))[0];
    ok(
      ahora.version === fila.version && ahora.editado_por === fila.editado_por && +ahora.editado_at === +fila.editado_at,
      `${tabla}: la fila real quedó como estaba (v${ahora.version})`
    );
  }
  const { data: objs } = await admin.storage.from("catalogo").list(creados.filas.find((f) => f.tabla === "catalogo_alquiler")?.id ?? "nada");
  ok((objs ?? []).length === 0, "no quedaron fotos de prueba en storage");
}

const historial = (tabla, id) =>
  q("select id, version, editado_por, datos_anteriores from historial_ediciones where tabla = $1 and fila_id = $2 order by version", [tabla, id]);
const png1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const png2 = Buffer.concat([png1, Buffer.from("segunda-version")]);

// Un turno más para el cliente de prueba, en una fecha lejos de todo lo demás (sin riesgo de
// pisarse con turnoId ni con las franjas reales): sirve para probar estados sin tocar el
// turno principal. Se borra con los demás turnos de `cli`; su historial, antes (ver limpiar()).
const nuevoTurno = async (isoInicio) => {
  const id = (await q(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin)
     values ($1, 'invitado', 45, 1, $2::timestamptz, $2::timestamptz + interval '45 minutes')
     returning id`,
    [cli, isoInicio]
  ))[0].id;
  turnosExtra.push(id);
  return id;
};

// Un cliente + charla sueltos, sin tocar `cli`/`conv` (que el aviso de turno, H1.16, ya usa
// para verificar el link a "la charla más reciente"): para lo que solo necesita una charla
// descartable. Se borra por cascada al borrar el cliente (creados.filas), y se verifica aparte
// en verificarLimpieza() porque no hay ningún otro chequeo genérico de "clientes PRUEBA%".
let contadorSuelto = 0;
const clientesSueltos = [];
const nuevaCharlaSuelta = async (estadoConv, motivos = []) => {
  const idCli = (await q(
    "insert into clientes (telefono, nombre) values ($1, $2) returning id",
    [`+549000099${String(++contadorSuelto).padStart(2, "0")}`, `${MARCA} suelta`]
  ))[0].id;
  const idConv = (await q("insert into conversaciones (cliente_id, estado) values ($1, $2) returning id", [idCli, estadoConv]))[0].id;
  for (const motivo of motivos) await q("insert into derivaciones (conversacion_id, motivo) values ($1, $2)", [idConv, motivo]);
  creados.filas.push({ tabla: "clientes", id: idCli });
  clientesSueltos.push(idCli);
  return idConv;
};

let panel;
try {
  await db.connect();
  seccion("Preparación");
  await fotografiar();
  const maxRegla = (await q("select coalesce(max(numero), 0)::int m from reglas_agente"))[0].m;
  const A = await crearUsuario("admin");
  const N = await crearUsuario("nuevo");
  const T = await crearUsuario("tercero");
  // La solicitud del admin de prueba queda pendiente a propósito: prueba que nadie resuelve la suya.
  await q("update perfiles set rol = 'admin', estado = 'aprobado' where id = $1", [A.id]);
  await sembrar();
  ok(true, "3 usuarios temporales, datos de prueba sembrados y filas reales fotografiadas");

  // Sin generador a propósito: con las ramas juntas, scripts/armar-prompt.mjs existe y el panel
  // lo encontraría solo. Apuntarlo a un archivo que no existe prueba el 503 igual en la rama de
  // paneles y en la integración.
  panel = arrancarPanel({ ARMAR_PROMPT_SCRIPT: AQUI + "no-existe-el-generador.mjs" });
  await esperarPanel(panel);
  const sa = await iniciarSesion(A.email, A.password);
  const sn = await iniciarSesion(N.email, N.password);
  const st = await iniciarSesion(T.email, T.password);

  const GETS = [
    "/api/bandeja", `/api/bandeja/${conv}`, "/api/atencion", "/api/turnos?fecha=2031-01-15", "/api/clientes",
    `/api/clientes/${cli}`, "/api/conocimiento", "/api/conocimiento/buscar?q=talle", "/api/catalogo", "/api/bitacora",
    "/api/configuracion", "/api/accesos", `/api/historial?tabla=clientes&id=${cli}`, "/api/configuracion/prompt-base",
  ];

  seccion("H1.8 control 3 — /api sin sesión: 401 en JSON, no un redirect a /login");
  for (const r of GETS) {
    const x = await api(null, "GET", r);
    ok(x.status === 401 && x.tipo.includes("json"), `GET ${r} → ${x.status}`);
  }
  {
    const x = await api(null, "PATCH", `/api/configuracion/reglas/${cli}`, { version: 1 });
    ok(x.status === 401 && x.tipo.includes("json"), `PATCH sin sesión → ${x.status}`);
    const y = await api(null, "GET", "/bandeja");
    ok(y.status === 307 && y.location.includes("/login"), `las páginas siguen redirigiendo: /bandeja sin sesión → ${y.status} ${y.location}`);
  }

  seccion("H1.10 control 3 (antes de aprobar) — la cuenta nueva no ve nada y cae en /esperando");
  for (const r of GETS) {
    const x = await api(sn, "GET", r);
    ok(x.status === 403 && x.tipo.includes("json"), `pendiente GET ${r} → ${x.status}`);
  }
  {
    const x = await api(sn, "GET", "/bandeja");
    ok(x.status === 307 && x.location.includes("/esperando"), `pendiente en /bandeja → ${x.status} ${x.location}`);
  }
  const tablas = (await q("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")).map((r) => r.table_name);
  {
    const conFilas = [];
    for (const t of tablas) {
      const { count, error } = await sn.directo.from(t).select("*", { count: "exact", head: true });
      if (error) conFilas.push(`${t}: error ${error.code}`);
      else if (count) conFilas.push(`${t}: ${count}`);
    }
    ok(
      conFilas.length === 2 && conFilas.includes("perfiles: 1") && conFilas.includes("solicitudes_acceso: 1"),
      `pendiente: 0 filas en ${tablas.length - 2} de ${tablas.length} tablas; solo ve su perfil y su solicitud (${conFilas.join(", ")})`
    );
    const { data } = await sn.directo.from("perfiles").update({ estado: "aprobado", rol: "admin" }).eq("id", N.id).select();
    ok((data ?? []).length === 0, "el pendiente no se puede aprobar a sí mismo (RLS: 0 filas)");
    ok((await q("select estado from perfiles where id = $1", [N.id]))[0].estado === "pendiente", "y su perfil sigue pendiente");
  }

  seccion("H1.10 — Accesos");
  const solDe = async (id) => (await q("select id from solicitudes_acceso where perfil_id = $1", [id]))[0].id;
  const solA = await solDe(A.id);
  const solN = await solDe(N.id);
  const solT = await solDe(T.id);
  {
    const x = await api(sa, "GET", "/api/accesos");
    const lista = x.datos.solicitudes ?? [];
    const sN = lista.find((s) => s.id === solN);
    ok(x.status === 200 && lista.some((s) => s.id === solT) && Boolean(sN), `el admin lista las pendientes (${x.status}, ${lista.length})`);
    ok(sN?.email === N.email && sN?.nombre === `${MARCA} nuevo` && typeof sN?.hace === "string", "cada solicitud trae nombre, email y hace cuánto");
  }
  {
    const x = await api(sa, "POST", `/api/accesos/${solA}`, { accion: "aprobar" });
    ok(x.status === 403, `el admin no resuelve su propia solicitud (${x.status}: ${x.datos.error})`);
    const y = await api(sa, "POST", `/api/accesos/${solT}`, { accion: "rechazar", rol: "admin" });
    ok(y.status === 400, `rechazar eligiendo rol → 400 (${y.status})`);
  }
  {
    const x = await api(sa, "POST", `/api/accesos/${solN}`, { accion: "aprobar" });
    const p = (await q("select estado, rol from perfiles where id = $1", [N.id]))[0];
    const s = (await q("select estado, resuelto_por, resuelto_at from solicitudes_acceso where id = $1", [solN]))[0];
    ok(x.status === 200 && p.estado === "aprobado" && p.rol === "equipo", `aprobar: perfil aprobado con rol equipo por defecto (${x.status})`);
    ok(s.estado === "aprobada" && s.resuelto_por === A.id && s.resuelto_at !== null, "aprobar: solicitud aprobada con resuelto_por = el admin y resuelto_at");
    const y = await api(sa, "POST", `/api/accesos/${solN}`, { accion: "aprobar" });
    ok(y.status === 409, `aprobar dos veces → 409 (${y.status})`);
  }
  {
    const x = await api(sa, "POST", `/api/accesos/${solT}`, { accion: "rechazar" });
    const p = (await q("select estado from perfiles where id = $1", [T.id]))[0];
    const s = (await q("select estado from solicitudes_acceso where id = $1", [solT]))[0];
    ok(x.status === 200 && p.estado === "rechazado" && s.estado === "rechazada", `rechazar: perfil rechazado y solicitud rechazada (${x.status})`);
  }
  {
    const x = await api(sn, "GET", "/api/accesos");
    ok(x.status === 403, `un usuario 'equipo' en /api/accesos → 403 (${x.status})`);
    const y = await api(sn, "POST", `/api/accesos/${solA}`, { accion: "aprobar" });
    ok(y.status === 403, `un 'equipo' no aprueba a nadie → 403 (${y.status})`);
    const z = await api(sn, "GET", "/api/clientes");
    ok(z.status === 200 && z.datos.clientes.some((c) => c.n === MARCA), `aprobada, la cuenta nueva ve datos (${z.status})`);
    const w = await api(sn, "GET", "/bandeja");
    ok(w.status === 200, `aprobada, entra a /bandeja (${w.status})`);
    const v = await api(st, "GET", "/api/clientes");
    const u = await api(st, "GET", "/bandeja");
    ok(v.status === 403 && u.location.includes("/esperando"), `rechazada: 403 en la API y /esperando en el panel (${v.status}, ${u.status})`);
  }
  {
    const { data } = await sn.directo.from("perfiles").update({ rol: "admin" }).eq("id", N.id).select();
    ok((data ?? []).length === 0, "un 'equipo' no se da rol admin (RLS: 0 filas)");
    const { error } = await sa.directo.from("perfiles").update({ rol: "equipo" }).eq("id", A.id);
    ok(error?.code === "42501", `un admin no se cambia su propio rol (${error?.code}: ${error?.message})`);
  }

  seccion("H1.8 controles 1 y 4 — cada pestaña con el admin: 200, datos y la forma de los mocks");
  {
    const x = await api(sa, "GET", "/api/bandeja");
    const f = x.datos.conversaciones?.find((c) => c.n === MARCA);
    ok(
      x.status === 200 && tiene(f, ["n", "m", "h", "chip", "cb", "cf", "bg", "tag", "hasTag", "id"]) && f.m === "para un casamiento" && f.tag === "Urgente" && f.chip === "Lucía" && f.sin_respuesta === true,
      `Bandeja (${x.status}): ${f && [f.n, f.m, f.h, f.chip, f.tag].join(" | ")}`
    );
    const y = await api(sa, "GET", "/api/bandeja?filtro=persona");
    ok(y.status === 200 && !y.datos.conversaciones.some((c) => c.n === MARCA), "Bandeja › Con persona no trae la charla que tiene Lucía");
    const z = await api(sa, "GET", "/api/bandeja?q=casamiento");
    ok(z.status === 200 && z.datos.conversaciones.some((c) => c.n === MARCA), "Bandeja › búsqueda por mensaje");
    const w = await api(sa, "GET", "/api/bandeja?filtro=otro");
    ok(w.status === 400, `Bandeja › filtro inválido → 400 (${w.status})`);
  }
  {
    const x = await api(sa, "GET", `/api/bandeja/${conv}`);
    ok(
      x.status === 200 && x.datos.mensajes.length === 3 && x.datos.eventos.length === 2 && x.datos.cliente.resumen.includes("Casamiento 20/1") && x.datos.cliente.resumen.includes("Talle 48"),
      `Charla (${x.status}): ${x.datos.cliente?.resumen}`
    );
    ok(x.datos.cliente.email === "prueba.paneles@example.com", `Charla › trae el mail del cliente (2.4): ${x.datos.cliente?.email}`);
    ok(
      x.datos.mensajes.map((m) => m.autor).join(",") === "cliente,lucia,cliente",
      `Charla › autor por mensaje, sin mostrador todavía (corrección de logica): ${x.datos.mensajes.map((m) => m.autor).join(",")}`
    );
  }
  let derivId;
  {
    const x = await api(sa, "GET", "/api/atencion");
    const d = x.datos.derivaciones?.find((v) => v.n === MARCA);
    derivId = d?.id;
    ok(
      x.status === 200 && tiene(d, ["n", "hace", "motivo", "cb", "cf", "borde", "resumen"]) && d.motivo === "Turno urgente" && d.resumen === "para un casamiento" && x.datos.pendientes >= 1,
      `Atención humana (${x.status}): ${d && [d.n, d.hace, d.motivo, d.resumen].join(" | ")}`
    );
  }

  seccion("Atención humana — tomar, devolver a Lucía y cerrar (PROCESOS.md § 4, pasos 6 y 7)");
  {
    const m0 = await api(sn, "POST", `/api/bandeja/${conv}/mensajes`, { texto: "todavía no la tomé" });
    ok(
      m0.status === 409 && m0.datos.detalle?.motivo === "no_tomada",
      `responder por mostrador antes de tomar la charla → 409 con detalle.motivo estable, no el texto (${m0.status}: ${m0.datos.detalle?.motivo})`
    );

    const t1 = await api(sn, "POST", `/api/bandeja/${conv}/tomar`);
    const dTras = (await q("select estado, atendida_por, atendida_at from derivaciones where id = $1", [derivId]))[0];
    ok(
      t1.status === 200 && t1.datos.ya_estaba === false && t1.datos.conversacion.estado === "derivada" && dTras.estado === "atendida" && dTras.atendida_por === N.email && Boolean(dTras.atendida_at),
      `tomar: 'activa' → 'derivada' y la derivación pendiente queda atendida por quien la tomó (${t1.status}, ${dTras.estado}, ${dTras.atendida_por})`
    );
    const t2 = await api(sa, "POST", `/api/bandeja/${conv}/tomar`);
    ok(t2.status === 200 && t2.datos.ya_estaba === true, `tomarla de nuevo no cambia nada (ya_estaba, ${t2.status})`);

    // El caso que sí escribe (texto válido + charla tomada + mensaje del cliente reciente) NO
    // se prueba por HTTP: mostrador_enviar encola en cola_trabajos, y el trigger de 0020
    // (disparar_worker) o, si no llega a tiempo, el cron de contención de cada 1 minuto,
    // llaman al worker desplegado — que de verdad intentaría mandar un WhatsApp. Se verifica
    // el mismo contrato en SQL, con otto.sin_disparo (el interruptor que usa logica en
    // tests/sql/run.mjs para lo mismo) y neutralizando el trabajo enseguida, por si el cron
    // pasa antes que la limpieza: nada de esto llega al worker real.
    let mensajeId;
    {
      await db.query("begin");
      await db.query("set local otto.sin_disparo = 'on'");
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: N.id, role: "authenticated", email: N.email })]);
      const r = (await db.query("select mostrador_enviar($1, $2) r", [conv, "Ya te confirmo el traje"])).rows[0].r;
      await db.query("commit");
      mensajeId = r.mensaje_id;
      const msj = (await q("select direccion, tipo, contenido from mensajes where id = $1", [mensajeId]))[0];
      const trabajo = (await q("select estado, payload from cola_trabajos where payload->>'mensaje_id' = $1", [mensajeId]))[0];
      ok(
        r.estado === "encolado" && msj?.direccion === "saliente" && msj?.contenido === "[mostrador] Ya te confirmo el traje" && trabajo?.payload.tipo === "mostrador" && trabajo?.payload.autor === N.email,
        `mostrador_enviar con la charla tomada: encola, el mensaje queda marcado [mostrador] y el trabajo trae quién escribió (${r.estado}, "${msj?.contenido}", ${trabajo?.payload.autor})`
      );
      await q("update cola_trabajos set estado = 'hecho', procesado_at = now() where payload->>'mensaje_id' = $1", [mensajeId]);
    }
    {
      const x = await api(sa, "GET", `/api/bandeja/${conv}`);
      const m = x.datos.mensajes?.find((v) => v.id === mensajeId);
      ok(
        x.status === 200 && m?.autor === "mostrador" && m.texto === "Ya te confirmo el traje" && !m.texto.includes("[mostrador]"),
        `Charla › el mensaje de mostrador se ve como 'mostrador', no como Lucía, y sin el prefijo (${m?.autor}, "${m?.texto}")`
      );
    }
    const m2 = await api(sn, "POST", `/api/bandeja/${conv}/mensajes`, { texto: "   " });
    ok(m2.status === 400 && m2.datos.error.includes("4000"), `mostrador con texto vacío → 400 (${m2.status}: ${m2.datos.error})`);
    const m3 = await api(sn, "POST", "/api/bandeja/11111111-1111-1111-1111-111111111111/mensajes", { texto: "hola" });
    ok(m3.status === 404, `mostrador a una charla que no existe → 404 (${m3.status})`);
    const charlaVieja = await nuevaCharlaSuelta("derivada");
    const viejo = await api(sn, "POST", `/api/bandeja/${charlaVieja}/mensajes`, { texto: "hola de nuevo" });
    ok(
      viejo.status === 409 && /24 hs/.test(viejo.datos.error) && viejo.datos.detalle?.motivo === "ventana_cerrada",
      `tomada pero sin mensaje del cliente en las últimas 24 hs → 409 con detalle.motivo: 'ventana_cerrada' (${viejo.status}: ${viejo.datos.detalle?.motivo})`
    );

    const dv1 = await api(sa, "POST", `/api/bandeja/${conv}/devolver`);
    ok(dv1.status === 200 && dv1.datos.ya_estaba === false && dv1.datos.conversacion.estado === "activa", `devolver a Lucía: 'derivada' → 'activa' (${dv1.status})`);
    const dv2 = await api(sn, "POST", `/api/bandeja/${conv}/devolver`);
    ok(dv2.status === 200 && dv2.datos.ya_estaba === true, `devolverla de nuevo no cambia nada (ya_estaba, ${dv2.status})`);
    const m4 = await api(sa, "POST", `/api/bandeja/${conv}/mensajes`, { texto: "Lucía está atendiendo" });
    ok(m4.status === 409, `con Lucía atendiendo de nuevo, mostrador vuelve a dar 409 (${m4.status})`);

    const c1 = await api(sn, "POST", `/api/bandeja/${conv}/cerrar`);
    ok(c1.status === 200 && c1.datos.ya_estaba === false && c1.datos.conversacion.estado === "cerrada", `cerrar: → 'cerrada' (${c1.status})`);
    const c2 = await api(sa, "POST", `/api/bandeja/${conv}/cerrar`);
    ok(c2.status === 200 && c2.datos.ya_estaba === true, `cerrarla de nuevo no cambia nada (ya_estaba, ${c2.status})`);
    const t3 = await api(sa, "POST", `/api/bandeja/${conv}/tomar`);
    const dv3 = await api(sa, "POST", `/api/bandeja/${conv}/devolver`);
    ok(t3.status === 409 && dv3.status === 409, `una charla cerrada no se puede tomar ni devolver (${t3.status}, ${dv3.status})`);
    const m5 = await api(sn, "POST", `/api/bandeja/${conv}/mensajes`, { texto: "hola" });
    ok(m5.status === 409, `mostrador a una charla cerrada → 409 (${m5.status})`);

    const nx = await api(sa, "POST", "/api/bandeja/11111111-1111-1111-1111-111111111111/tomar");
    const mal = await api(sa, "POST", "/api/bandeja/abc/tomar");
    ok(nx.status === 404 && mal.status === 400, `charla que no existe → 404; id mal formado → 400 (${nx.status}, ${mal.status})`);
    const rechazo = await api(st, "POST", `/api/bandeja/${conv}/tomar`);
    ok(rechazo.status === 403, `una cuenta rechazada no puede tomar charlas (${rechazo.status})`);

    // Carrera real: dos "tomar" a la vez sobre la misma charla (Promise.all, no en serie).
    // atencion_resolver hace el select ... for update (0032): tiene que ganar uno solo y el
    // otro recibir ya_estaba, sin que los dos crean que la tomaron ni que la derivación quede
    // marcada dos veces.
    {
      const convRace = await nuevaCharlaSuelta("activa", ["pide_persona"]);
      const derivRace = (await q("select id from derivaciones where conversacion_id = $1", [convRace]))[0].id;
      const dos = await Promise.all([
        api(sa, "POST", `/api/bandeja/${convRace}/tomar`),
        api(sn, "POST", `/api/bandeja/${convRace}/tomar`),
      ]);
      const ganador = dos[0].datos.ya_estaba === false ? A.email : dos[1].datos.ya_estaba === false ? N.email : null;
      const fila = (await q("select estado from conversaciones where id = $1", [convRace]))[0];
      const derivFila = (await q("select estado, atendida_por from derivaciones where id = $1", [derivRace]))[0];
      ok(
        dos.every((x) => x.status === 200) &&
          dos.filter((x) => x.datos.ya_estaba === false).length === 1 &&
          dos.filter((x) => x.datos.ya_estaba === true).length === 1 &&
          Boolean(ganador) &&
          fila.estado === "derivada" &&
          derivFila.estado === "atendida" &&
          derivFila.atendida_por === ganador,
        `dos "tomar" a la vez sobre la misma charla: gana uno solo (ya_estaba false/true) y queda una sola derivación atendida por el que ganó, verificado en la base (${dos.map((x) => x.datos.ya_estaba).join(",")}; atendida_por ${derivFila.atendida_por})`
      );
    }

    // Por la API de Supabase, sin pasar por mi ruta: la firma la sigue poniendo la base. Una
    // charla suelta (no `cli`/`conv`, que el aviso de turno usa para el link a "la charla más
    // reciente" del cliente).
    const otraConv = await nuevaCharlaSuelta("activa", ["pide_persona"]);
    const otraDer = (await q("select id from derivaciones where conversacion_id = $1", [otraConv]))[0].id;
    const directo = await sn.directo
      .from("derivaciones")
      .update({ estado: "atendida", atendida_por: "mentira", atendida_at: "2020-01-01" })
      .eq("id", otraDer)
      .select("atendida_por, atendida_at")
      .single();
    ok(
      directo.data?.atendida_por === N.email && !String(directo.data?.atendida_at ?? "").startsWith("2020"),
      `por la API de Supabase, sin pasar por mi ruta, atendida_por también lo pone la base (${directo.data?.atendida_por})`
    );
  }

  {
    const x = await api(sa, "GET", "/api/turnos?fecha=2031-01-15");
    const t = x.datos.turnos?.find((v) => v.n === MARCA);
    ok(
      x.status === 200 && tiene(t, ["h", "n", "t", "p", "e", "eb", "ef", "borde"]) && t.h === "10:00" && t.t === "Invitado · 45’" && t.p === "Probador 3" && t.e === "Sin confirmar",
      `Turnos (${x.status}): ${t && [t.h, t.t, t.p, t.e].join(" | ")}`
    );
    const versionEnBase = (await q("select version from turnos where id = $1", [turnoId]))[0].version;
    ok(t?.version === versionEnBase, `GET /api/turnos trae version (sin esto, el PATCH de estado no tiene qué mandar): ${t?.version} vs. ${versionEnBase} en la base`);
    ok(x.datos.horario?.apertura === "10:00" && x.datos.horario?.corte_desde === "14:00" && x.datos.probadores === 3, `el día trae horario y probadores de las tablas (${JSON.stringify(x.datos.horario)}, ${x.datos.probadores})`);
    ok(JSON.stringify(x.datos.franjas) === JSON.stringify([{ desde: "13:00", hasta: "19:00", probadores: 3 }]), `un miércoles trae su franja de turnos (0030): ${JSON.stringify(x.datos.franjas)}`);
    const sab = await api(sa, "GET", "/api/turnos?fecha=2031-01-18");
    const dom = await api(sa, "GET", "/api/turnos?fecha=2031-01-19");
    ok(sab.datos.franjas?.map((f) => `${f.desde}-${f.hasta}x${f.probadores}`).join(" ") === "09:30-12:00x3 13:30-18:30x2" && JSON.stringify(dom.datos.franjas) === "[]", `sábado con dos franjas y domingo sin ninguna (${sab.datos.franjas?.length}, ${dom.datos.franjas?.length})`);
    const y = await api(sa, "GET", "/api/turnos?fecha=15-01-2031");
    ok(y.status === 400, `Turnos › fecha mal formada → 400 (${y.status})`);
  }
  {
    const x = await api(sa, "GET", "/api/clientes");
    const c = x.datos.clientes?.find((v) => v.n === MARCA);
    ok(
      x.status === 200 && tiene(c, ["n", "tel", "ev", "f", "rol", "ult", "turno"]) && c.ev === "Casamiento" && c.f === "20/1" && c.rol === "Invitado" && c.turno === "mié 10:00",
      `Clientes (${x.status}): ${c && [c.tel, c.ev, c.f, c.rol, c.ult, c.turno].join(" | ")}`
    );
    const y = await api(sa, "GET", `/api/clientes/${cli}`);
    ok(y.status === 200 && y.datos.datos?.nombre === MARCA && y.datos.turnos.length === 1 && typeof y.datos.cliente.version === "number", `Ficha del cliente (${y.status})`);
  }

  seccion("Turnos › estados desde la pestaña Turnos (PROCESOS.md § 2, 'En el local' y 'Retiro y devolución')");
  {
    const v0 = (await q("select version from turnos where id = $1", [turnoId]))[0].version;
    const salteo = await api(sn, "PATCH", `/api/turnos/${turnoId}`, { version: v0, estado: "retiro" });
    ok(salteo.status === 409 && salteo.datos.error.includes("sin-confirmar"), `no se puede pasar de 'sin-confirmar' a 'retiro' salteando 'alquiló' (${salteo.status}: ${salteo.datos.error})`);

    const x1 = await api(sn, "PATCH", `/api/turnos/${turnoId}`, { version: v0, estado: "alquilo" });
    ok(x1.status === 200 && x1.datos.fila.estado === "alquilo" && x1.datos.fila.editado_por === N.email, `un 'equipo' marca 'alquiló' (${x1.status}, editado_por ${x1.datos.fila?.editado_por})`);
    const inv2 = await api(sa, "PATCH", `/api/turnos/${turnoId}`, { version: x1.datos.fila.version, estado: "devolvio" });
    ok(inv2.status === 409, `no se puede pasar de 'alquiló' a 'devolvió' salteando 'retiró' (${inv2.status})`);
    const x2 = await api(sa, "PATCH", `/api/turnos/${turnoId}`, { version: x1.datos.fila.version, estado: "retiro" });
    ok(x2.status === 200 && x2.datos.fila.estado === "retiro", `'alquiló' → 'retiró' (${x2.status})`);
    const x3 = await api(sa, "PATCH", `/api/turnos/${turnoId}`, { version: x2.datos.fila.version, estado: "devolvio" });
    ok(x3.status === 200 && x3.datos.fila.estado === "devolvio", `'retiró' → 'devolvió' (${x3.status})`);
    const x4 = await api(sa, "PATCH", `/api/turnos/${turnoId}`, { version: x3.datos.fila.version, estado: "alquilo" });
    ok(x4.status === 409, `'devolvió' es un estado final: no se puede volver a 'alquiló' (${x4.status})`);
    const vieja = await api(sa, "PATCH", `/api/turnos/${turnoId}`, { version: v0, estado: "no-vino" });
    ok(vieja.status === 409 && vieja.datos.error.includes("editó mientras tanto"), `con una versión vieja, 409 sin pisar nada (${vieja.status})`);

    const h = await historial("turnos", turnoId);
    const viaApi = await api(sa, "GET", `/api/historial?tabla=turnos&id=${turnoId}`);
    ok(
      h.length === 3 && h[0].datos_anteriores.estado === "sin-confirmar" && viaApi.status === 200 && viaApi.datos.versiones.length === 3,
      `tres cambios de estado → tres filas de historial, con la de antes de 'alquiló' y GET /api/historial (nueva en la lista blanca de hoy) también las trae (${h.length}, ${viaApi.status})`
    );
    const v1id = h.find((r) => r.version === 1)?.id;
    const restaurarV1 = await api(sa, "POST", `/api/historial/${v1id}/restaurar`, { version: x3.datos.fila.version });
    ok(restaurarV1.status === 422, `volver a la v1 ('sin-confirmar') no es un estado que se escriba desde acá → 422, sin tocar nada (${restaurarV1.status})`);

    const turnoCancelar = await nuevoTurno("2031-02-01T09:00:00Z");
    const sinMotivo = await api(sn, "PATCH", `/api/turnos/${turnoCancelar}`, { version: 1, estado: "cancelado" });
    ok(sinMotivo.status === 400 && sinMotivo.datos.error.includes("motivo"), `cancelar sin motivo → 400 (${sinMotivo.status}: ${sinMotivo.datos.error})`);
    const conMotivo = await api(sn, "PATCH", `/api/turnos/${turnoCancelar}`, { version: 1, estado: "cancelado", motivo_cancelacion: "el cliente avisó que no puede" });
    const filaCancelada = (await q("select estado, motivo_cancelacion, cancelado_at from turnos where id = $1", [turnoCancelar]))[0];
    ok(
      conMotivo.status === 200 && filaCancelada.estado === "cancelado" && filaCancelada.motivo_cancelacion === "el cliente avisó que no puede" && Boolean(filaCancelada.cancelado_at),
      `cancelar con motivo → 200, y 0011 pone cancelado_at solo (${conMotivo.status}, cancelado_at ${Boolean(filaCancelada.cancelado_at)})`
    );

    const turnoNoVino = await nuevoTurno("2031-02-02T09:00:00Z");
    const noVino = await api(sa, "PATCH", `/api/turnos/${turnoNoVino}`, { version: 1, estado: "no-vino" });
    ok(noVino.status === 200 && noVino.datos.fila.estado === "no-vino", `marcar 'no vino' (${noVino.status})`);
  }
  {
    const x = await api(sa, "GET", "/api/conocimiento");
    ok(x.status === 200 && x.datos.secciones.length >= 16 && x.datos.secciones.every((s) => tiene(s, ["tema", "titulo", "n", "fragmentos"])), `Conocimiento (${x.status}): ${x.datos.secciones?.length} temas`);
  }
  {
    const x = await api(sa, "GET", "/api/catalogo");
    const cc = x.datos.accesorios?.find((a) => a.n === "Camisa + corbata");
    ok(x.status === 200 && Array.isArray(x.datos.modelos) && tiene(cc, ["n", "alq", "compra"]) && cc.alq === "$33.500", `Catálogo (${x.status}): Camisa + corbata ${cc?.alq}`);
  }
  {
    const x = await api(sa, "GET", "/api/bitacora");
    const e = x.datos.eventos?.find((v) => v.d === "PRUEBA paneles: consultó el catálogo");
    const b = x.datos.eventos?.find((v) => v.d === "PRUEBA paneles: rehecho");
    ok(
      x.status === 200 && x.datos.kpis?.length === 4 && x.datos.kpis.every((k) => tiene(k, ["num", "l", "sub"])) && tiene(e, ["h", "tipo", "n", "d", "tone", "bg"]) && e.n === MARCA && b?.tipo === "Barandilla" && x.datos.costo.hoy.startsWith("US$"),
      `Bitácora (${x.status}): ${JSON.stringify(x.datos.kpis?.map((k) => `${k.l} ${k.num}`))}, costo hoy ${x.datos.costo?.hoy}`
    );
  }
  {
    const x = await api(sa, "GET", "/api/configuracion");
    ok(
      // herramientas: >= 13 (las de H1.4), no === 13: agente suma herramientas nuevas con el
      // tiempo (p. ej. confirmar_turno, 16/9) y esto no es un control de cuántas hay.
      x.status === 200 && x.datos.reglas.length >= 1 && x.datos.reglas.every((r) => tiene(r, ["i", "t", "id", "version"])) && x.datos.agenda.horarios.length === 6 && x.datos.agenda.duraciones.length === 6 && x.datos.agenda.configuracion?.cantidad_probadores === 3 && x.datos.herramientas.length >= 13 && Boolean(x.datos.presentacion),
      `Configuración (${x.status}): ${x.datos.reglas?.length} reglas, ${x.datos.agenda?.horarios.length} horarios, ${x.datos.herramientas?.length} herramientas`
    );
    const y = await api(sa, "GET", `/api/historial?tabla=perfiles&id=${A.id}`);
    ok(y.status === 400, `historial de una tabla fuera de la lista blanca → 400 (${y.status})`);
  }

  seccion("H1.9 — edición del dueño con versión e historial");
  let modelo;
  {
    const x = await api(sa, "POST", "/api/catalogo/modelos", { modelo: `${MARCA} ambo`, precio_base: 150000, colores: [{ nombre: "azul noche", hex: "#1F2A3C" }], talles: ["44", "46", "48"], activo: false });
    modelo = x.datos.fila;
    if (modelo) creados.filas.push({ tabla: "catalogo_alquiler", id: modelo.id });
    ok(x.status === 201 && modelo.version === 1 && modelo.editado_por === A.email, `Catálogo › alta de modelo (${x.status}), editado_por = el admin`);
    const x1 = await api(sa, "PATCH", `/api/catalogo/modelos/${modelo.id}`, { version: 1, precio_base: 155000 });
    const x2 = await api(sa, "PATCH", `/api/catalogo/modelos/${modelo.id}`, { version: 2, descripcion: "corte italiano" });
    const h = await historial("catalogo_alquiler", modelo.id);
    ok(x1.status === 200 && x2.status === 200 && x2.datos.fila.version === 3, `editar dos veces (${x1.status}, ${x2.status}) → versión ${x2.datos.fila?.version}`);
    ok(h.length === 2 && h.every((r) => r.editado_por === A.email) && Number(h[0].datos_anteriores.precio_base) === 150000, `→ 2 filas de historial con la versión anterior, firmadas por el usuario logueado`);
    const c = await api(sa, "PATCH", `/api/catalogo/modelos/${modelo.id}`, { version: 1, precio_base: 1 });
    ok(c.status === 409, `con una versión vieja → 409 y no se pisa nada (${c.status})`);
    const d = await api(sa, "PATCH", `/api/catalogo/modelos/${modelo.id}`, { version: 3, editado_por: "otro" });
    ok(d.status === 400, `un campo que no se edita (editado_por) → 400 (${d.status})`);
    const e = await api(sa, "PATCH", `/api/catalogo/modelos/${modelo.id}`, { version: 3, precio_base: -5 });
    ok(e.status === 400, `precio negativo → 400 (${e.status})`);
    const v1 = h.find((r) => r.version === 1);
    const r = await api(sa, "POST", `/api/historial/${v1.id}/restaurar`, { version: 3 });
    const h2 = await historial("catalogo_alquiler", modelo.id);
    ok(
      r.status === 200 && Number(r.datos.fila.precio_base) === 150000 && r.datos.fila.descripcion === null && r.datos.fila.version === 4 && r.datos.restaurada_desde === 1,
      `volver a la v1 (${r.status}): precio ${r.datos.fila?.precio_base}, versión ${r.datos.fila?.version}`
    );
    ok(h2.length === 3 && h2[2].version === 3 && h2[2].datos_anteriores.descripcion === "corte italiano", "la restauración deja su propia fila de historial (la v3 que reemplazó)");
    const g = await api(sa, "GET", `/api/historial?tabla=catalogo_alquiler&id=${modelo.id}`);
    ok(g.status === 200 && g.datos.versiones.length === 3 && g.datos.versiones[0].version === 3, `GET /api/historial (${g.status}): ${g.datos.versiones?.length} versiones`);
    const cat = await api(sa, "GET", "/api/catalogo");
    const m = cat.datos.modelos.find((v) => v.id === modelo.id);
    ok(m && m.n === `${MARCA} ambo` && m.p === "$150.000" && m.talles === "44–48" && m.dots[0] === "#1F2A3C" && m.on === false && m.off === true, `el modelo sale en Catálogo con la forma del mock (${m && [m.p, m.talles, m.dots.join(",")].join(" | ")})`);
  }
  {
    const form = (buf) => {
      const f = new FormData();
      f.set("modelo_id", modelo.id);
      f.set("archivo", new File([buf], "Frente Ambo.png", { type: "image/png" }));
      return f;
    };
    const x1 = await api(sa, "POST", "/api/catalogo/fotos", form(png1));
    if (x1.datos?.ruta) creados.storage.push(x1.datos.ruta);
    ok(x1.status === 201 && x1.datos.fila.fotos.length === 1 && x1.datos.url.includes(`/catalogo/${modelo.id}/frente-ambo.png`), `Catálogo › subir foto (${x1.status}): ${x1.datos.ruta ?? x1.datos.error}`);
    const x2 = await api(sa, "POST", "/api/catalogo/fotos", form(png2));
    const { data: lista } = await admin.storage.from("catalogo").list(modelo.id);
    const obj = lista?.find((o) => o.name === "frente-ambo.png");
    ok(x2.status === 200 && x2.datos.reemplazada === true && obj?.metadata?.size === png2.length, `reemplazarla por la misma ruta (${x2.status}): en storage pesa ${obj?.metadata?.size} = ${png2.length} (la nueva)`);
    const pub = await fetch(x1.datos.url);
    ok(pub.status === 200, `el link público responde (${pub.status})`);
    const x3 = await api(sn, "POST", "/api/catalogo/fotos", form(png1));
    ok(x3.status === 403, `un 'equipo' no sube fotos del catálogo (${x3.status})`);
  }
  {
    const x = await api(sa, "POST", "/api/catalogo/accesorios", { nombre: `${MARCA} accesorio`, precio: 1000, precio_compra: 900, activo: false });
    if (x.datos.fila) creados.filas.push({ tabla: "accesorios_alquiler", id: x.datos.fila.id });
    const y = await api(sa, "PATCH", `/api/catalogo/accesorios/${x.datos.fila.id}`, { version: 1, precio: 1100 });
    const h = await historial("accesorios_alquiler", x.datos.fila.id);
    ok(x.status === 201 && y.status === 200 && h.length === 1 && h[0].editado_por === A.email, `Catálogo › accesorio: alta y edición con historial (${x.status}, ${y.status})`);
  }
  {
    const altaEquipo = await api(sn, "POST", "/api/conocimiento/fragmentos", { tema: "talles", titulo: "x", texto: "x" });
    ok(altaEquipo.status === 403, `un 'equipo' ya no da de alta fragmentos (decisión de Mateo, 16/9): solo admin (${altaEquipo.status})`);
    const x = await api(sa, "POST", "/api/conocimiento/fragmentos", { tema: "talles", titulo: `${MARCA} talles`, texto: "Tenemos talles del 44 al 62 y trajes para chicos desde el talle 4.", activo: false });
    const frag = x.datos.fila;
    if (frag) creados.filas.push({ tabla: "fragmentos", id: frag.id });
    ok(x.status === 201, `Conocimiento › alta de fragmento (${x.status})`);
    const bloqueado = await api(sn, "PATCH", `/api/conocimiento/fragmentos/${frag.id}`, { version: 1, texto: "no debería poder" });
    ok(bloqueado.status === 403, `un 'equipo' ya no edita Conocimiento: solo admin (${bloqueado.status})`);
    const y = await api(sa, "PATCH", `/api/conocimiento/fragmentos/${frag.id}`, { version: 1, texto: "Tenemos talles del 44 al 62 y trajes para chicos desde el talle 4 (editado)." });
    const h = await historial("fragmentos", frag.id);
    ok(y.status === 200 && y.datos.fila.editado_por === A.email && h.length === 1, `un admin edita Conocimiento (${y.status}) y la edición queda firmada por él`);
    const z = await api(sa, "POST", "/api/conocimiento/fragmentos", { tema: "inventado", titulo: "x", texto: "x" });
    ok(z.status === 400, `tema fuera de los 16 → 400 (${z.status})`);
    const b = await api(sa, "GET", "/api/conocimiento/buscar?q=" + encodeURIComponent("tienen talle para chico?"));
    ok(b.status === 200 && b.datos.resultados.some((r) => r.id === frag.id), `buscador: «tienen talle para chico?» encuentra el fragmento (${b.status})`);
  }
  {
    const x = await api(sa, "POST", "/api/configuracion/reglas", { texto: `${MARCA}: regla de prueba`, activo: false });
    if (x.datos.fila) creados.filas.push({ tabla: "reglas_agente", id: x.datos.fila.id });
    ok(x.status === 201 && x.datos.fila.numero === maxRegla + 1, `Configuración › alta de regla al final (#${x.datos.fila?.numero})`);
    const y = await api(sn, "PATCH", `/api/configuracion/reglas/${x.datos.fila.id}`, { version: 1, texto: "x" });
    ok(y.status === 403, `un 'equipo' no edita reglas (${y.status})`);
    const z = await api(sa, "PATCH", `/api/configuracion/reglas/${x.datos.fila.id}`, { version: 1, texto: `${MARCA}: regla editada` });
    ok(z.status === 200 && (await historial("reglas_agente", x.datos.fila.id)).length === 1, `el admin sí, con historial (${z.status})`);
  }
  // Filas reales: se editan dejando el mismo valor, así nada de lo que usan Lucía y logica cambia.
  const real = (t) => fotos[t].fila;
  {
    const f = real("contexto_agente");
    const x = await api(sa, "PATCH", `/api/configuracion/contexto/${f.id}`, { version: f.version, valor: f.valor });
    ok(x.status === 200 && x.datos.fila.version === f.version + 1 && x.datos.fila.editado_por === A.email, `Configuración › Lucía (presentación): edición (${x.status}) → v${x.datos.fila?.version}`);
    const h = await historial("contexto_agente", f.id);
    const r = await api(sa, "POST", `/api/historial/${h.at(-1).id}/restaurar`, { version: f.version + 1 });
    ok(r.status === 200 && r.datos.fila.valor === f.valor, `y volver a la versión anterior (${r.status})`);
  }
  {
    const f = real("herramientas_agente");
    const x = await api(sa, "PATCH", `/api/configuracion/herramientas/${f.id}`, { version: f.version, descripcion: f.descripcion, activa: f.activa });
    ok(x.status === 200 && x.datos.fila.editado_por === A.email, `Configuración › Herramientas (anotar): edición (${x.status})`);
    const y = await api(sa, "PATCH", `/api/configuracion/herramientas/${f.id}`, { version: f.version + 1, nombre: "otra" });
    ok(y.status === 400, `el nombre de una herramienta no se edita (${y.status})`);
  }
  {
    const f = real("horarios");
    const x = await api(sa, "PATCH", `/api/configuracion/horarios/${f.id}`, { version: f.version, hora_apertura: "19:30" });
    ok(x.status === 400, `Agenda › apertura después del cierre → 400 (${x.status}: ${x.datos.error})`);
    const y = await api(sa, "PATCH", `/api/configuracion/horarios/${f.id}`, { version: f.version, corte_desde: "20:00" });
    ok(y.status === 400, `Agenda › corte afuera del horario → 400 (${y.status}: ${y.datos.error})`);
    const z = await api(sa, "PATCH", `/api/configuracion/horarios/${f.id}`, { version: f.version, hora_apertura: f.hora_apertura.slice(0, 5) });
    ok(z.status === 200 && z.datos.fila.editado_por === A.email, `Agenda › horario del lunes: edición (${z.status})`);
    const w = await api(sa, "POST", "/api/configuracion/horarios", { dia_semana: 1, hora_apertura: "10:00", hora_cierre: "19:00" });
    ok(w.status === 409, `Agenda › abrir un día que ya tiene horario → 409 (${w.status})`);
  }
  {
    const f = real("duraciones_turno");
    const x = await api(sa, "PATCH", `/api/configuracion/duraciones/${f.id}`, { version: f.version, duracion_min: f.duracion_min });
    const guardadoX = (await q("select duracion_min, version from duraciones_turno where id = $1", [f.id]))[0];
    ok(
      x.status === 200 && guardadoX.duracion_min === f.duracion_min && guardadoX.version === f.version + 1,
      `Agenda › duración de 'novio': edición, verificada en la base (${x.status}, duracion_min ${guardadoX.duracion_min}, v${guardadoX.version})`
    );
    const y = await api(sa, "PATCH", `/api/configuracion/duraciones/${f.id}`, { version: f.version + 1, duracion_min: 0 });
    ok(y.status === 400, `duración 0 → 400 (${y.status})`);
  }
  {
    const f = real("configuracion_agenda");
    const x = await api(sa, "PATCH", "/api/configuracion/agenda", { version: f.version, cantidad_probadores: 2 });
    ok(x.status === 409 && x.datos.error.includes("franja"), `Agenda › bajar a 2 probadores con franjas de 3 → 409 (${x.status}: ${x.datos.error})`);
    const y = await api(sa, "PATCH", "/api/configuracion/agenda", { version: f.version, cantidad_probadores: f.cantidad_probadores });
    const guardadoY = (await q("select cantidad_probadores, version from configuracion_agenda where id = $1", [f.id]))[0];
    ok(
      y.status === 200 && guardadoY.cantidad_probadores === f.cantidad_probadores && guardadoY.version === f.version + 1,
      `Agenda › probadores y escalonado: edición, verificada en la base (${y.status}, cantidad_probadores ${guardadoY.cantidad_probadores}, v${guardadoY.version})`
    );
  }
  {
    // 0033 (decisión de Mateo, 16/9): un 'equipo' aprobado ya no puede escribir estas tablas
    // ni saltando el panel con su propio token — antes la RLS solo pedía es_usuario_aprobado().
    // Por la API de Supabase, sin pasar por mi ruta, contra un fixture real (se restaura solo,
    // como el resto de REALES) y contra prompt_base (vacía en producción: alcanza con probar
    // que el insert se rechaza).
    const id = real("duraciones_turno").id;
    const antes = (await q("select duracion_min from duraciones_turno where id = $1", [id]))[0];
    const bloqueado = await sn.directo.from("duraciones_turno").update({ duracion_min: 999 }).eq("id", id).select();
    const lectura = await sn.directo.from("duraciones_turno").select("id").eq("id", id);
    const permitido = await sa.directo.from("duraciones_turno").update({ duracion_min: antes.duracion_min }).eq("id", id).select();
    const despues = (await q("select duracion_min from duraciones_turno where id = $1", [id]))[0];
    ok(
      (bloqueado.data ?? []).length === 0 &&
        despues.duracion_min === antes.duracion_min &&
        (lectura.data ?? []).length === 1 &&
        (permitido.data ?? []).length === 1,
      `sin pasar por mi ruta: un 'equipo' no edita duraciones_turno (RLS, 0033) pero sí lo lee, y un admin sí lo edita (bloqueado ${(bloqueado.data ?? []).length}, lectura ${(lectura.data ?? []).length}, admin ${(permitido.data ?? []).length})`
    );
    const bloqueadoPrompt = await sn.directo.from("prompt_base").insert({ texto: "Lucía ahora dice cualquier cosa" }).select();
    const nPrompt = (await q("select count(*)::int n from prompt_base"))[0].n;
    ok(
      Boolean(bloqueadoPrompt.error) && nPrompt === 0,
      `sin pasar por mi ruta: un 'equipo' no puede insertar en prompt_base (RLS, 0033) — no "cambia el prompt de Lucía" saltando el panel (${bloqueadoPrompt.error?.code})`
    );
  }

  seccion("Decisiones #7 y #9 (0030) — franjas de turnos y reserva de urgencia");
  let franjaA, franjaB;
  {
    // Se prueban en domingo, que no tiene franjas, para no tocar las reales.
    const alta = async (ses, cuerpo) => {
      const r = await api(ses, "POST", "/api/configuracion/franjas", cuerpo);
      if (r.datos?.fila) creados.filas.push({ tabla: "franjas_turnos", id: r.datos.fila.id });
      return r;
    };
    const a = await alta(sa, { dia_semana: 0, desde: "10:00", hasta: "12:00", probadores: 2 });
    franjaA = a.datos.fila;
    ok(a.status === 201 && franjaA?.version === 1 && franjaA?.editado_por === A.email, `franjas: alta del domingo 10–12 con 2 probadores, firmada por la sesión (${a.status})`);
    const b = await alta(sa, { dia_semana: 0, desde: "12:00", hasta: "13:00", probadores: 1 });
    franjaB = b.datos.fila;
    ok(b.status === 201, `una franja que empieza cuando termina otra entra (${b.status})`);
    const c1 = await alta(sa, { dia_semana: 0, desde: "11:00", hasta: "14:00", probadores: 1 });
    ok(c1.status === 409 && c1.datos.error.includes("domingo"), `una que se pisa → 409 (${c1.status}: ${c1.datos.error})`);
    const d = await alta(sa, { dia_semana: 0, desde: "15:00", hasta: "14:00", probadores: 1 });
    ok(d.status === 400, `termina antes de empezar → 400 (${d.status}: ${d.datos.error})`);
    const e = await alta(sa, { dia_semana: 0, desde: "15:00", hasta: "16:00", probadores: 4 });
    ok(e.status === 400 && e.datos.error.includes("3 probador"), `pide 4 probadores con 3 en la agenda → 400 (${e.status}: ${e.datos.error})`);
    const g = await alta(sa, { dia_semana: 0, desde: "15:00", hasta: "16:00", probadores: 1, editado_por: "otro" });
    ok(g.status === 400, `editado_por en el request → 400 (${g.status})`);
    const s = await alta(sn, { dia_semana: 0, desde: "15:00", hasta: "16:00", probadores: 1 });
    ok(s.status === 403, `un 'equipo' no crea franjas (${s.status})`);
    const directo = await sa.directo.from("franjas_turnos").insert({ dia_semana: 0, desde: "10:30", hasta: "11:00", probadores: 1 }).select();
    if (directo.data?.[0]) creados.filas.push({ tabla: "franjas_turnos", id: directo.data[0].id });
    ok(directo.error?.code === "23P01", `por la API de Supabase, sin el panel, la base también la frena (${directo.error?.code})`);
  }
  {
    const p1 = await api(sa, "PATCH", `/api/configuracion/franjas/${franjaA.id}`, { version: 1, hasta: "11:30" });
    const p2 = await api(sa, "PATCH", `/api/configuracion/franjas/${franjaA.id}`, { version: 2, probadores: 3 });
    const p3 = await api(sa, "PATCH", `/api/configuracion/franjas/${franjaA.id}`, { version: 2, probadores: 1 });
    const h = await historial("franjas_turnos", franjaA.id);
    ok(p1.status === 200 && p2.status === 200 && p2.datos.fila.version === 3 && h.length === 2 && h.every((r) => r.editado_por === A.email) && h[0].datos_anteriores.hasta === "12:00:00", `franjas: editar dos veces → 2 filas de historial con la versión anterior (${p1.status}, ${p2.status}, ${h.length} filas)`);
    ok(p3.status === 409, `con una versión vieja → 409 sin escribir (${p3.status})`);
    const p4 = await api(sa, "PATCH", `/api/configuracion/franjas/${franjaB.id}`, { version: 1, desde: "11:00" });
    ok(p4.status === 409, `mover una franja encima de otra → 409 (${p4.status}: ${p4.datos.error})`);
    const r = await api(sa, "POST", `/api/historial/${h[0].id}/restaurar`, { version: 3 });
    ok(r.status === 200 && r.datos.fila.hasta === "12:00:00" && r.datos.fila.probadores === 2 && r.datos.fila.version === 4, `volver a la v1 de la franja (${r.status}: hasta ${r.datos.fila?.hasta}, ${r.datos.fila?.probadores} probadores, v${r.datos.fila?.version})`);
  }
  {
    const x1 = await api(sa, "DELETE", `/api/configuracion/franjas/${franjaB.id}`, { version: 7 });
    ok(x1.status === 409, `borrar con una versión vieja → 409 (${x1.status})`);
    const sn1 = await api(sn, "DELETE", `/api/configuracion/franjas/${franjaB.id}`, { version: 1 });
    ok(sn1.status === 403, `un 'equipo' no borra franjas (${sn1.status})`);
    const x2 = await api(sa, "DELETE", `/api/configuracion/franjas/${franjaB.id}`, { version: 1 });
    const x3 = await api(sa, "DELETE", `/api/configuracion/franjas/${franjaB.id}`, { version: 1 });
    const hb = await historial("franjas_turnos", franjaB.id);
    ok(x2.status === 200 && x3.status === 404 && hb.length === 1 && hb[0].datos_anteriores.borrado_por === A.email && Boolean(hb[0].datos_anteriores.borrado_at), `borrar → 200 y la versión borrada queda en el historial con quién la borró; otra vez → 404 (${x2.status}, ${x3.status}, ${hb[0]?.datos_anteriores.borrado_por})`);
    const x4 = await api(sa, "DELETE", `/api/configuracion/reglas/${franjaA.id}`, { version: 1 });
    ok(x4.status === 405, `las reglas no se borran por esta vía (${x4.status})`);
    const l = await api(sa, "GET", "/api/historial?tabla=franjas_turnos&borradas=1");
    ok(l.status === 200 && l.datos.borradas.some((f) => f.fila_id === franjaB.id), `la franja borrada aparece en las borradas (${l.status}: ${l.datos.borradas?.length})`);
    const l2 = await api(sa, "GET", "/api/historial?tabla=reglas_agente&borradas=1");
    ok(l2.status === 400, `borradas de una tabla que no se borra → 400 (${l2.status})`);
    const r = await api(sa, "POST", `/api/historial/${hb[0].id}/restaurar`, {});
    ok(r.status === 201 && r.datos.fila.id === franjaB.id && r.datos.fila.version === 2 && r.datos.recreada === true && r.datos.fila.editado_por === A.email, `volver a la versión borrada la crea de nuevo con el mismo id y la v2 (${r.status}, v${r.datos.fila?.version})`);
    const l3 = await api(sa, "GET", "/api/historial?tabla=franjas_turnos&borradas=1");
    ok(!l3.datos.borradas.some((f) => f.fila_id === franjaB.id), "ya no aparece en las borradas");
  }
  {
    const cf = (await q("select id, version, dias_reserva_urgencia from configuracion_agenda"))[0];
    const g = await api(sa, "GET", "/api/configuracion");
    const fr = g.datos.agenda?.franjas ?? [];
    ok(g.datos.agenda?.configuracion?.dias_reserva_urgencia === cf.dias_reserva_urgencia && fr.filter((f) => f.dia_semana === 0).length === 2 && fr.find((f) => f.dia_semana === 6 && f.desde === "13:30:00")?.probadores === 2, `GET /api/configuracion trae las franjas (${fr.length}) y la reserva (${g.datos.agenda?.configuracion?.dias_reserva_urgencia})`);
    const u1 = await api(sa, "PATCH", "/api/configuracion/agenda", { version: cf.version, dias_reserva_urgencia: 10 });
    const u2 = await api(sa, "PATCH", "/api/configuracion/agenda", { version: cf.version + 1, dias_reserva_urgencia: null });
    const u3 = await api(sa, "PATCH", "/api/configuracion/agenda", { version: cf.version + 2, dias_reserva_urgencia: 0 });
    const u4 = await api(sn, "PATCH", "/api/configuracion/agenda", { version: cf.version + 2, dias_reserva_urgencia: 3 });
    const h = (await historial("configuracion_agenda", cf.id)).filter((r) => r.version >= cf.version);
    ok(u1.status === 200 && u1.datos.fila.dias_reserva_urgencia === 10 && u2.status === 200 && u2.datos.fila.dias_reserva_urgencia === null, `reserva de urgencia: 10 y después vacía (sin reserva) (${u1.status}, ${u2.status})`);
    ok(h.length === 2 && h[0].datos_anteriores.dias_reserva_urgencia === cf.dias_reserva_urgencia && h[1].datos_anteriores.dias_reserva_urgencia === 10 && h[1].editado_por === A.email, `dos ediciones → 2 filas de historial con la reserva anterior (${h.map((r) => r.datos_anteriores.dias_reserva_urgencia).join(", ")})`);
    ok(u3.status === 400 && u4.status === 403, `0 días → 400; un 'equipo' → 403 (${u3.status}, ${u4.status})`);
    const r = await api(sa, "POST", `/api/historial/${h[0].id}/restaurar`, { version: cf.version + 2 });
    ok(r.status === 200 && r.datos.fila.dias_reserva_urgencia === cf.dias_reserva_urgencia, `volver a la versión anterior de la reserva (${r.status}: ${r.datos.fila?.dias_reserva_urgencia})`);
  }
  {
    const x = await api(sa, "POST", "/api/configuracion/notas", { titulo: MARCA, texto: `${MARCA}: nota`, activo: false });
    if (x.datos.fila) creados.filas.push({ tabla: "notas_dueno", id: x.datos.fila.id });
    const y = await api(sa, "PATCH", `/api/configuracion/notas/${x.datos.fila.id}`, { version: 1, texto: `${MARCA}: nota editada` });
    ok(x.status === 201 && x.datos.fila.creado_por === A.email && y.status === 200 && (await historial("notas_dueno", x.datos.fila.id)).length === 1, `Configuración › Notas: alta firmada y edición con historial (${x.status}, ${y.status})`);
  }
  {
    const x = await api(sa, "POST", "/api/configuracion/enlaces", { nombre: `${MARCA} link`, url: "https://example.com", activo: false });
    if (x.datos.fila) creados.filas.push({ tabla: "enlaces", id: x.datos.fila.id });
    const y = await api(sa, "PATCH", `/api/configuracion/enlaces/${x.datos.fila.id}`, { version: 1, url: "ftp://example.com" });
    const z = await api(sa, "PATCH", `/api/configuracion/enlaces/${x.datos.fila.id}`, { version: 1, url: "https://example.org" });
    ok(x.status === 201 && y.status === 400 && z.status === 200 && (await historial("enlaces", x.datos.fila.id)).length === 1, `Configuración › Enlaces: alta, link inválido 400 y edición con historial (${x.status}, ${y.status}, ${z.status})`);
  }
  {
    const v = (await q("select version from clientes where id = $1", [cli]))[0].version;
    const x = await api(sa, "PATCH", `/api/clientes/${cli}`, { version: v, color_preferido: "Azul noche", evento: "fiesta" });
    const y = await api(sn, "PATCH", `/api/clientes/${cli}`, { version: v + 1, notas_libres: "Quiere moño" });
    const z = await api(sa, "PATCH", `/api/clientes/${cli}`, { version: v + 2, evento: "boda" });
    const w = await api(sa, "PATCH", `/api/clientes/${cli}`, { version: v + 2, telefono: "123" });
    const h = await historial("clientes", cli);
    ok(x.status === 200 && y.status === 200 && h.length === 2 && h[1].editado_por === A.email, `Clientes › ficha: dos ediciones (admin y equipo) → 2 filas de historial (${h.map((r) => r.editado_por).join(", ")})`);
    ok(z.status === 400 && w.status === 400, `evento fuera del enum y teléfono → 400 (${z.status}, ${w.status})`);

    // 2.4: el mail se guarda en minúscula y sin espacios; inválido da 400 con el motivo; vacío lo
    // borra. Termina con un mail válido puesto de nuevo: el aviso de turno (más abajo) también
    // verifica que lo trae.
    const e2 = await api(sn, "PATCH", `/api/clientes/${cli}`, { version: v + 2, email: "no-es-un-mail" });
    const e3 = await api(sn, "PATCH", `/api/clientes/${cli}`, { version: v + 2, email: "" });
    const e1 = await api(sa, "PATCH", `/api/clientes/${cli}`, { version: v + 3, email: "  Juan.Perez@Gmail.COM  " });
    ok(e2.status === 400 && e2.datos.detalle?.some((d) => d.campo === "email"), `email inválido → 400 con el motivo (${e2.status}: ${JSON.stringify(e2.datos.detalle)})`);
    ok(e3.status === 200 && e3.datos.fila.email === null, `email vacío lo borra (${e3.status}: ${e3.datos.fila?.email})`);
    ok(e1.status === 200 && e1.datos.fila.email === "juan.perez@gmail.com", `email: se guarda en minúscula y sin espacios (${e1.status}: ${e1.datos.fila?.email})`);
  }
  {
    const g = await api(sa, "GET", "/api/configuracion/prompt-base");
    ok(g.status === 200 && g.datos.prompt === null && g.datos.generador_disponible === false, `Prompt base: sin cargar y sin generador (${g.status})`);
    const x = await api(sa, "PUT", "/api/configuracion/prompt-base", { texto: "Sos Lucía, asistente de Mr. Otto." });
    ok(x.status === 503 && (await q("select count(*)::int n from prompt_base"))[0].n === 0, `sin el generador de agente no se guarda nada (${x.status}: ${x.datos.error})`);
    const y = await api(sn, "GET", "/api/configuracion/prompt-base");
    ok(y.status === 403, `un 'equipo' no ve el prompt base (${y.status})`);
  }

  seccion("H1.16 — aviso de turno antes de que empiece (decisión #10)");
  {
    // Turnos del cliente de prueba alrededor de ahora, en probadores que no se pisan.
    const nuevo = async (desdeMin, probador, estado = "sin-confirmar", confirmadoPor = null) =>
      (await q(
        `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, confirmado, confirmado_por)
         values ($1, 'invitado', 45, $2, now() + make_interval(mins => $3::int), now() + make_interval(mins => $3::int + 45), $4, $5, $6)
         returning id`,
        [cli, probador, desdeMin, estado, confirmadoPor !== null, confirmadoPor]
      ))[0].id;
    const tA = await nuevo(10, 1); // empieza en 10': sale
    const tB = await nuevo(120, 1); // en 2 h: no sale
    const tC = await nuevo(-20, 2, "confirmado", "cliente"); // empezó hace 20' y sigue: sale
    const tD = await nuevo(5, 3, "cancelado");
    const tE = await nuevo(-60, 3); // ya terminó
    const tF = await nuevo(15, 3, "no-vino");
    turnosExtra.push(tA, tB, tC, tD, tE, tF);
    const cfg = (await q("select id, version, aviso_turno_min from configuracion_agenda"))[0];

    const g = await api(sn, "GET", "/api/turnos/avisos");
    const nuestros = (g.datos.turnos ?? []).filter((t) => turnosExtra.includes(t.id));
    ok(
      g.status === 200 && g.datos.aviso_turno_min === 30 && nuestros.map((t) => t.id).join() === [tC, tA].join(),
      `GET /api/turnos/avisos (equipo): salen el que empezó hace 20' y el de dentro de 10', en ese orden; no el de 2 h, el terminado, el cancelado ni el no-vino (${g.status}, ${nuestros.length})`
    );
    const a = nuestros.find((t) => t.id === tA);
    const ficha = (await q("select nombre, telefono, email, fecha_evento::text fecha_evento, talle_aprox, color_preferido, notas_libres from clientes where id = $1", [cli]))[0];
    ok(
      a?.cliente.nombre === ficha.nombre && a.cliente.telefono === ficha.telefono && a.cliente.email === ficha.email && a.cliente.fecha_evento === ficha.fecha_evento && a.cliente.talle_aprox === ficha.talle_aprox && a.cliente.color_preferido === ficha.color_preferido && a.cliente.notas === ficha.notas_libres && Boolean(a.cliente.evento) && Boolean(a.cliente.rol) && /^\d\d:\d\d$/.test(a.desde) && /^\d\d:\d\d$/.test(a.hasta) && a.t === "Invitado · 45’" && a.p === "Probador 1" && a.cliente_confirmo === false && a.enlaces.charla === `/bandeja/charla?id=${conv}` && a.enlaces.ficha === `/clientes?id=${cli}`,
      `el cartel trae el turno, la ficha (con el mail, 2.4) y los links (${a?.desde}–${a?.hasta}, ${a?.t}, ${a?.cliente.nombre}, ${a?.cliente.email}, ${a?.cliente.evento} ${a?.cliente.fecha_evento_corta}, ${a?.cliente.rol}, talle ${a?.cliente.talle_aprox}, ${a?.cliente.color_preferido})`
    );
    ok(ficha.email === "juan.perez@gmail.com", `(control del propio test) el mail sigue puesto y normalizado antes del aviso: ${ficha.email}`);
    const c = nuestros.find((t) => t.id === tC);
    ok(c?.cliente_confirmo === true && c.confirmado_por === "cliente", "el que confirmó el cliente sale marcado como confirmado por WhatsApp");

    const u1 = await api(sa, "PATCH", "/api/configuracion/agenda", { version: cfg.version, aviso_turno_min: 180 });
    const g2 = await api(sn, "GET", "/api/turnos/avisos");
    ok(u1.status === 200 && g2.datos.aviso_turno_min === 180 && g2.datos.turnos.some((t) => t.id === tB), `con aviso_turno_min = 180 sale también el de dentro de 2 h, sin tocar código (${u1.status})`);
    const u2 = await api(sa, "PATCH", "/api/configuracion/agenda", { version: cfg.version + 1, aviso_turno_min: 0 });
    const u3 = await api(sa, "PATCH", "/api/configuracion/agenda", { version: cfg.version + 1, aviso_turno_min: null });
    const u4 = await api(sn, "PATCH", "/api/configuracion/agenda", { version: cfg.version + 1, aviso_turno_min: 45 });
    const hc = (await historial("configuracion_agenda", cfg.id)).filter((r) => r.version === cfg.version);
    ok(u2.status === 400 && u3.status === 400 && u4.status === 403 && hc.length === 1 && hc[0].datos_anteriores.aviso_turno_min === 30, `0 o vacío → 400, un 'equipo' → 403, y la edición dejó historial con el 30 (${u2.status}, ${u3.status}, ${u4.status})`);
    const r = await api(sa, "POST", `/api/historial/${hc[0].id}/restaurar`, { version: cfg.version + 1 });
    const gc = await api(sa, "GET", "/api/configuracion");
    ok(r.status === 200 && r.datos.fila.aviso_turno_min === 30 && gc.datos.agenda?.configuracion?.aviso_turno_min === 30, `volver al 30, y GET /api/configuracion lo trae (${r.status})`);

    const sinSesion = await api(null, "POST", `/api/turnos/${tA}/ok`);
    ok(sinSesion.status === 401, `OK sin sesión → 401 (${sinSesion.status})`);
    const o1 = await api(sn, "POST", `/api/turnos/${tA}/ok`);
    const fa = (await q("select estado, confirmado, confirmado_at, confirmado_por, aviso_ok_at, aviso_ok_por, version, editado_por from turnos where id = $1", [tA]))[0];
    ok(
      o1.status === 200 && o1.datos.confirmo === true && o1.datos.ya_estaba === false && fa.estado === "confirmado" && fa.confirmado === true && Boolean(fa.confirmado_at) && fa.confirmado_por === N.email && fa.aviso_ok_por === N.email && Boolean(fa.aviso_ok_at),
      `OK de un 'equipo' sobre un sin-confirmar → confirmado, con quién y cuándo (${o1.status}, ${fa.estado}, ${fa.confirmado_por})`
    );
    const ha = await historial("turnos", tA);
    ok(ha.length === 1 && ha[0].datos_anteriores.estado === "sin-confirmar" && fa.version === 2 && fa.editado_por === N.email, `el OK deja su fila de historial (v${ha[0]?.version}, ${ha[0]?.datos_anteriores.estado}) y la v2 firmada por la sesión`);
    const o2 = await api(sa, "POST", `/api/turnos/${tA}/ok`);
    ok(o2.status === 200 && o2.datos.ya_estaba === true && o2.datos.turno.aviso_ok_por === N.email, `un segundo OK no pisa al primero (${o2.status}, sigue firmado por el primero)`);
    const o3 = await api(sa, "POST", `/api/turnos/${tC}/ok`);
    ok(o3.status === 200 && o3.datos.confirmo === false && o3.datos.turno.confirmado_por === "cliente" && o3.datos.turno.aviso_ok_por === A.email, `si ya confirmó el cliente, solo registra el OK (${o3.status})`);
    const g3 = await api(sn, "GET", "/api/turnos/avisos");
    ok(g3.status === 200 && !g3.datos.turnos.some((t) => t.id === tA || t.id === tC), "después del OK el cartel ya no sale");
    const tG = await nuevo(26, 2); // otro en la ventana, para dos OK a la vez
    turnosExtra.push(tG);
    const dos = await Promise.all([api(sa, "POST", `/api/turnos/${tG}/ok`), api(sn, "POST", `/api/turnos/${tG}/ok`)]);
    const primero = dos.find((x) => x.datos.ya_estaba === false);
    const segundo = dos.find((x) => x.datos.ya_estaba === true);
    const fg = (await q("select aviso_ok_por, confirmado_por, version from turnos where id = $1", [tG]))[0];
    ok(
      dos.every((x) => x.status === 200) && Boolean(primero) && Boolean(segundo) && primero.datos.confirmo === true && fg.aviso_ok_por === primero.datos.turno.aviso_ok_por && fg.confirmado_por === fg.aviso_ok_por && fg.version === 2,
      `dos OK a la vez: uno confirma, el otro recibe ya_estaba y queda una sola versión nueva (ganó ${fg.aviso_ok_por === A.email ? "el admin" : "el equipo"}, v${fg.version})`
    );
    const fuera = await Promise.all([tB, tD, tE, tF].map((id) => api(sa, "POST", `/api/turnos/${id}/ok`)));
    ok(fuera.every((x) => x.status === 409), `antes de la ventana, cancelado, terminado y no-vino → 409 (${fuera.map((x) => x.datos.error).join(" | ")})`);
    const nx = await api(sa, "POST", "/api/turnos/11111111-1111-1111-1111-111111111111/ok");
    const mal = await api(sa, "POST", "/api/turnos/abc/ok");
    ok(nx.status === 404 && mal.status === 400, `turno que no existe → 404; id mal formado → 400 (${nx.status}, ${mal.status})`);
    const d = await sn.directo
      .from("turnos")
      .update({ confirmado_por: "cliente", aviso_ok_at: "2020-01-01T00:00:00Z", aviso_ok_por: "otra persona" })
      .eq("id", tB)
      .select("confirmado_por, aviso_ok_por, aviso_ok_at")
      .single();
    ok(d.data?.confirmado_por === N.email && d.data?.aviso_ok_por === N.email && !d.data.aviso_ok_at.startsWith("2020"), `por la API de Supabase, sin el panel, la firma la pone la base (${d.data?.confirmado_por}, ${d.data?.aviso_ok_por})`);
  }
  await frenarPanel(panel);

  seccion("H1.9 control 4 — prompt base con un DOBLE del generador (contrato de lib/edicion/prompt.ts)");
  panel = arrancarPanel({ ARMAR_PROMPT_SCRIPT: AQUI + "generador-doble.mjs" });
  await esperarPanel(panel);
  {
    const x = await api(sa, "PUT", "/api/configuracion/prompt-base", { texto: "Sos Lucía, asistente de {{negocio}}." });
    ok(x.status === 422 && x.datos.error.includes("{{") && (await q("select count(*)::int n from prompt_base"))[0].n === 0, `prompt con {{ → ${x.status} con el motivo: ${x.datos.error}`);
    const y = await api(sa, "PUT", "/api/configuracion/prompt-base", { texto: "Sos Lucía, asistente de Mr. Otto.\n1. Regla uno." });
    if (y.datos.fila) creados.filas.push({ tabla: "prompt_base", id: y.datos.fila.id });
    ok(y.status === 201 && y.datos.fila.version === 1, `prompt que pasa → se guarda (${y.status})`);
    const z = await api(sa, "PUT", "/api/configuracion/prompt-base", { version: 1, texto: "Sos Lucía, asistente de Mr. Otto.\n1. Regla uno, v2." });
    const w = await api(sa, "PUT", "/api/configuracion/prompt-base", { version: 2, texto: "La primera línea no la nombra." });
    const vigente = (await q("select version, texto from prompt_base"))[0];
    ok(z.status === 200 && w.status === 422 && vigente.version === 2 && vigente.texto.endsWith("v2."), `si el generador rechaza, sigue activa la anterior (${z.status}, ${w.status}, vigente v${vigente.version})`);
    const h = await historial("prompt_base", y.datos.fila.id);
    const r = await api(sa, "POST", `/api/historial/${h[0].id}/restaurar`, { version: 2 });
    ok(r.status === 200 && r.datos.fila.texto === "Sos Lucía, asistente de Mr. Otto.\n1. Regla uno.", `volver a la v1 del prompt pasa por el generador y se aplica (${r.status})`);
  }
} catch (e) {
  fallas++;
  console.error("\n💥", e?.stack || e);
  if (panel) console.error("--- log del panel ---\n" + panel.log().slice(-3000));
} finally {
  await frenarPanel(panel);
  seccion("Limpieza");
  try {
    await limpiar();
    await verificarLimpieza();
  } catch (e) {
    fallas++;
    console.error("💥 limpieza:", e?.stack || e);
  }
  await db.end();
}
console.log(`\n${"=".repeat(40)}\n${fallas ? "❌" : "✅"} ${total - fallas}/${total} aserciones`);
process.exit(fallas ? 1 : 0);
