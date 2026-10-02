// Prueba las dos migraciones y el prompt efectivo sin publicar nada ni llamar a IA.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { validarPrompt } from "./armar-prompt.mjs";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: new URL("../.env", import.meta.url) });
const { Client } = require("pg");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout = '5s'");
  for (const nombre of ["0074_reserva_datos_minimos.sql", "0075_resumen_turno_datos_opcionales.sql"]) {
    await db.query(readFileSync(new URL(`../supabase/migrations/${nombre}`, import.meta.url), "utf8"));
  }
  const { rows: [{ texto }] } = await db.query("select prompt_vigente() as texto");
  assert.deepEqual(validarPrompt(texto), []);
  assert(texto.includes("Para agendar alcanza con teléfono de la charla y fecha y hora elegidas."));
  assert(texto.includes("Nombre y correo son opcionales"));
  assert(texto.includes("Al agendar sale una sola lista: Nombre, Número, Día y hora, Gmail."));
  assert(!texto.includes("devuelve pedir_mail: true"));
  console.log("Configuración y prompt efectivo verificados. Se revierten todos los cambios.");
} finally {
  await db.query("rollback");
  await db.end();
}
