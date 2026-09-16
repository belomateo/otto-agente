// scripts/probar-turno.js — los 17 guiones de scripts/guiones-agente.cjs (AGENTE.md § 13) contra
// el emulador `probar-agente` (H1.7).
//
// Los guiones en sí (mensajes y verificar) viven en guiones-agente.cjs, compartidos con
// tests/sql/guiones-desplegado.mjs (Fase 2, contra el worker real): un solo lugar para que las
// dos corridas prueben exactamente lo mismo. Acá solo está lo que es DE ESTE transporte: cómo se
// manda un mensaje al emulador (HTTP) y qué teléfono ficticio le toca a cada guion
// (+5493410001NNN, la convención del emulador — no confundir con 5490000000NNN, la del worker
// real, que usa guiones-desplegado.mjs).
//
// Cada guion se corre de a uno (CLAUDE.md § 7) y se verifica contra la BASE, no contra lo que
// dijo Lucía (principio 9).
//
// Uso:
//   node scripts/probar-turno.js                 corre los 17 guiones, de a uno
//   node scripts/probar-turno.js <guion>          corre uno solo
//   node scripts/probar-turno.js --listar         lista los guiones
//
// Necesita el emulador corriendo (ver supabase/functions/probar-agente/index.ts) y
// OPENAI_API_KEY real en el proceso (si el entorno ya tiene una OPENAI_API_KEY de otra cosa —
// pasó en esta máquina con un valor para Ollama — hay que limpiarla antes: `env -u
// OPENAI_API_KEY node scripts/probar-turno.js`).

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pg = require("pg");
const { crearGuiones, sembrarCatalogo, borrarCatalogo, limpiarTelefono } = require("./guiones-agente.cjs");

const URL_EMULADOR = process.env.PROBAR_AGENTE_URL || "http://localhost:8811";

const GUIONES = crearGuiones();
// Mismo orden en que quedaron declarados en guiones-agente.cjs: el teléfono de cada uno es fijo
// desde H1.7 (+5493410001001 en adelante) para no romper referencias viejas en logs o charlas.
const NOMBRES_EN_ORDEN = Object.keys(GUIONES);
const telefonoDe = (nombre) => `+5493410001${String(NOMBRES_EN_ORDEN.indexOf(nombre) + 1).padStart(3, "0")}`;

// ── infraestructura mínima: mandar un mensaje ─────────────────────────────────────────────

async function mandar(telefono, mensaje) {
  const r = await fetch(URL_EMULADOR, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ telefono, mensaje }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`emulador respondió ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

// ── correr uno, correr todos, informe ────────────────────────────────────────────────────

// Una conexión NUEVA por guion (no una compartida para toda la corrida): si el pooler de
// Supabase corta una conexión ociosa a mitad de un guion — pasó de verdad el 15/9, "Connection
// terminated unexpectedly" en medio de una corrida larga — el próximo guion arranca con una
// conexión sana en vez de heredar una ya rota. `sql.on("error", ...)` es imprescindible:
// pg.Client es un EventEmitter, y un 'error' sin escuchar tira una excepción no capturada que
// mata el proceso de Node entero (así se cayó la corrida esa vez, a mitad de "lo-voy-a-pensar").
async function conConexionPropia(url, fn) {
  const sql = new pg.Client({ connectionString: url });
  let seRompio = null;
  sql.on("error", (err) => { seRompio = err; });
  await sql.connect();
  try {
    const resultado = await fn(sql);
    if (seRompio) throw seRompio;
    return resultado;
  } finally {
    await sql.end().catch(() => {});
  }
}

async function correrUno(url, nombre) {
  const g = GUIONES[nombre];
  const telefono = telefonoDe(nombre);
  const resultado = { nombre, ok: true, detalles: [], error: null, respuestas: [] };
  try {
    await conConexionPropia(url, async (sql) => {
      let idsCatalogo = [];
      try {
        await limpiarTelefono(sql, telefono);
        if (g.necesitaCatalogo) idsCatalogo = await sembrarCatalogo(sql);

        let ultimaRespuesta = null;
        for (const mensaje of g.mensajes) {
          ultimaRespuesta = await mandar(telefono, mensaje);
          resultado.respuestas.push(ultimaRespuesta.mensajes || []);
          if (ultimaRespuesta.derivo) break; // si ya derivó, no tiene sentido seguir mandando mensajes del guion
        }

        for (const [ok, detalle] of await g.verificar(sql, telefono, resultado.respuestas, ultimaRespuesta)) {
          resultado.detalles.push({ ok: !!ok, detalle });
          if (!ok) resultado.ok = false;
        }
      } finally {
        if (idsCatalogo.length) await borrarCatalogo(sql, idsCatalogo).catch(() => {});
        await limpiarTelefono(sql, telefono).catch(() => {});
      }
    });
  } catch (e) {
    resultado.ok = false;
    resultado.error = String(e?.message ?? e);
  }
  return resultado;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--listar")) {
    console.log(NOMBRES_EN_ORDEN.join("\n"));
    return;
  }
  const pedidos = args.filter((a) => !a.startsWith("--"));
  const nombres = pedidos.length ? pedidos : NOMBRES_EN_ORDEN;
  for (const n of nombres) {
    if (!GUIONES[n]) {
      console.error(`No existe el guion "${n}". Guiones: ${NOMBRES_EN_ORDEN.join(", ")}`);
      process.exitCode = 1;
      return;
    }
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url) { console.error("Falta SUPABASE_DB_URL"); process.exit(1); }

  const resultados = [];
  for (const nombre of nombres) {
    process.stdout.write(`▶ ${nombre} ... `);
    const r = await correrUno(url, nombre);
    resultados.push(r);
    console.log(r.ok ? "✅" : "❌");
    if (!r.ok) {
      if (r.error) console.log(`   💥 ${r.error}`);
      for (const d of r.detalles) if (!d.ok) console.log(`   ❌ ${d.detalle}`);
    }
    for (const [i, msj] of r.respuestas.entries()) {
      console.log(`   [${i + 1}] ${JSON.stringify(GUIONES[nombre].mensajes[i])} → ${msj.join(" | ") || "(sin mensaje)"}`);
    }
  }

  const ok = resultados.filter((r) => r.ok).length;
  console.log(`\n${ok}/${resultados.length} guiones pasaron.`);
  if (ok !== resultados.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("💥 Error inesperado:", e);
  process.exit(1);
});
