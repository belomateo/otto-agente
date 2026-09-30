// scripts/actualizar-prompt.mjs — sube el contenido de prompt.md a la tabla prompt_base.
// La tabla tiene un row activo; este script lo actualiza. Si no existe ninguno activo,
// inserta uno nuevo.
//
// Uso: node scripts/actualizar-prompt.mjs [--seco]

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(RAIZ, "package.json"));
require("dotenv").config({ path: resolve(RAIZ, ".env") });
const pg = require("pg");

const seco = process.argv.includes("--seco");
if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

const contenido = readFileSync(resolve(RAIZ, "plantilla-agente/02-prompt.md"), "utf8");
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const t0 = Date.now();
try {
  await db.query("begin");
  // Intentar UPDATE del row activo; si no existe ninguno, INSERT.
  const upd = await db.query(
    "UPDATE prompt_base SET texto = $1, editado_at = now() WHERE unica = true RETURNING id",
    [contenido],
  );
  let accion;
  if (upd.rowCount === 0) {
    await db.query("INSERT INTO prompt_base (texto) VALUES ($1)", [contenido]);
    accion = "insertado";
  } else {
    accion = `actualizado (id ${upd.rows[0].id})`;
  }
  await db.query(seco ? "rollback" : "commit");
  const ms = Date.now() - t0;
  console.log(
    seco
      ? `✅ prompt.md corre bien en seco — ${ms} ms (nada cambiado)`
      : `✅ prompt.md ${accion} en prompt_base — ${ms} ms`,
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(`❌ No se actualizó nada: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
