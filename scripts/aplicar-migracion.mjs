// scripts/aplicar-migracion.mjs — aplica UNA migración a la base real, todo o nada.
//
// No hay registro de migraciones en este proyecto (supabase_migrations.schema_migrations no existe):
// se aplican a mano. Esto las aplica con las dos protecciones que se aprendieron a los golpes:
//   · lock_timeout de 5 s: una migración que toca triggers de turnos o policies toma candados que
//     frenan a la Lucía real. Si algo está ocupado, falla rápido en vez de quedar en cola y trabar
//     a todos los que vienen detrás.
//   · una sola transacción: si cualquier sentencia falla, no queda nada a medias.
//
// Uso (desde la raíz del repo):
//   node scripts/aplicar-migracion.mjs supabase/migrations/0067_turnos_bloqueos_agenda.sql --seco
//       la aplica y la deshace: sirve para ver que corre, sin cambiar nada
//   node scripts/aplicar-migracion.mjs supabase/migrations/0067_turnos_bloqueos_agenda.sql
//       la aplica de verdad
// Las migraciones de este repo son idempotentes: correrla dos veces tiene que dar lo mismo.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(RAIZ, "package.json"));
require("dotenv").config({ path: resolve(RAIZ, ".env") });
const pg = require("pg");

const argumentos = process.argv.slice(2);
const seco = argumentos.includes("--seco");
const archivo = argumentos.find((a) => !a.startsWith("--"));
if (!archivo || !/\.sql$/.test(archivo)) {
  console.error("Uso: node scripts/aplicar-migracion.mjs supabase/migrations/<archivo>.sql [--seco]");
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

const sql = readFileSync(resolve(RAIZ, archivo), "utf8");
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const t0 = Date.now();
try {
  await db.query("begin");
  await db.query("set local lock_timeout = '5s'");
  await db.query(sql);
  await db.query(seco ? "rollback" : "commit");
  const ms = Date.now() - t0;
  console.log(seco ? `✅ ${basename(archivo)} corre bien (en seco: no se cambió nada) — ${ms} ms` : `✅ ${basename(archivo)} aplicada — ${ms} ms`);
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(`❌ No se aplicó nada: ${e.message}`);
  if (/lock timeout/i.test(e.message)) console.error("   Algo estaba usando esas tablas. Esperá un minuto y probá de nuevo.");
  process.exitCode = 1;
} finally {
  await db.end();
}
