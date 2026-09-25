// scripts/cargar-prompt.mjs — carga plantilla-agente/02-prompt.md en la base (prompt_base), que
// es de donde la Lucía de WhatsApp lee su prompt (prompt_vigente(), 0050). Sin este paso, editar
// la plantilla no cambia nada: el 25/9 se encontró que once tandas de cambios del 19 al 23/9
// estaban en el repo y nunca habían llegado a la base.
//
// Uso (desde la raíz del repo):
//   node scripts/cargar-prompt.mjs "<quién y por qué>"            carga
//   node scripts/cargar-prompt.mjs "<quién y por qué>" --pisar    carga aunque la base tenga
//                                                                 renglones que el repo no
//
// Qué hace, en orden:
//   1. Si la base tiene renglones que la plantilla del repo no tiene (la dueña editó desde el
//      panel), NO carga: los lista, para pasarlos primero a la plantilla. --pisar lo saltea.
//   2. Carga todo o nada: sube la versión y, si prompt_vigente() no arma un prompt válido con
//      la plantilla nueva, rollback (el trigger de 0050 también lo impide).
//   3. Regenera el respaldo (supabase/functions/_shared/prompt.md) y confirma que es igual al
//      prompt vivo.
// Código 0 = cargado. Código 1 = no se cargó nada.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(RAIZ, "package.json"));
require("dotenv").config({ path: resolve(RAIZ, ".env") });
const pg = require("pg");

const argumentos = process.argv.slice(2);
const pisar = argumentos.includes("--pisar");
const motivo = argumentos.filter((a) => a !== "--pisar")[0]?.trim();
if (!motivo) {
  console.error('Falta el motivo: node scripts/cargar-prompt.mjs "<quién y por qué>"');
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

const lf = (t) => String(t ?? "").replace(/\r\n?/g, "\n");
// Solo lo que le llega al modelo: los comentarios HTML los saca prompt_vigente(), así que
// cambiarlos no pisa nada de nadie.
const renglones = (t) =>
  new Set(lf(t).replace(/<!--[\s\S]*?-->/g, "").split("\n").map((l) => l.trim()).filter(Boolean));
const plantilla = lf(readFileSync(resolve(RAIZ, "plantilla-agente/02-prompt.md"), "utf8"));

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
try {
  const actual = (await db.query("select texto, version, editado_por from prompt_base")).rows[0];
  if (actual && !pisar) {
    const delRepo = renglones(plantilla);
    const soloEnLaBase = [...renglones(actual.texto)].filter((l) => !delRepo.has(l));
    if (soloEnLaBase.length) {
      console.error(`La base (versión ${actual.version}, editada por "${actual.editado_por}") tiene ${soloEnLaBase.length} renglón(es) que la plantilla del repo no tiene. Cargar los borraría:`);
      for (const l of soloEnLaBase.slice(0, 15)) console.error(`   · ${l}`);
      console.error("Pasalos a plantilla-agente/02-prompt.md, o volvé a correr con --pisar si de verdad sobran. No se cargó nada.");
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) {
    await db.query("begin");
    const r = await db.query(
      "update prompt_base set texto = $1, version = version + 1, editado_por = $2 returning version",
      [plantilla, motivo],
    );
    if (r.rowCount !== 1) throw new Error(`prompt_base: se tocaron ${r.rowCount} filas, tiene que ser 1`);
    const vivo = (await db.query("select prompt_vigente() as p")).rows[0].p;
    if (!vivo) throw new Error("con esta plantilla prompt_vigente() no arma un prompt válido");
    await db.query("commit");
    console.log(`✅ Cargado: prompt_base versión ${r.rows[0].version}, ${lf(vivo).split("\n").length} líneas en el prompt vivo.`);

    execFileSync(process.execPath, [resolve(RAIZ, "scripts/armar-prompt.mjs")], { stdio: "inherit", cwd: RAIZ });
    const respaldo = lf(readFileSync(resolve(RAIZ, "supabase/functions/_shared/prompt.md"), "utf8"));
    if (respaldo.trim() === lf(vivo).trim()) console.log("✅ El respaldo (_shared/prompt.md) es igual al prompt vivo.");
    else {
      console.error("⚠ El respaldo quedó distinto del prompt vivo: revisalo antes de desplegar.");
      process.exitCode = 1;
    }
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(`No se cargó nada: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
