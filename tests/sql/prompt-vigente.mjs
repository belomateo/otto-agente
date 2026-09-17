// Control de 0050: prompt_vigente() (SQL, lo que lee Lucía en vivo) tiene que dar EXACTAMENTE lo
// mismo que scripts/armar-prompt.mjs (Node, lo que valida el panel al guardar y lo que genera el
// prompt.md de respaldo). Son dos implementaciones de la misma cosa y si se separan, la dueña
// edita el prompt, el panel le dice que está bien, y Lucía habla con otra cosa.
//
// Compara con la MISMA plantilla de los dos lados: la que está guardada en prompt_base, que es la
// que la dueña edita. No usa el .md del repo, que puede estar atrasado respecto de la base.
// Corre todo adentro de una transacción con rollback: no deja nada.
// Uso: node tests/sql/prompt-vigente.mjs
import "dotenv/config";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";

if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

let fallas = 0;
const assert = (ok, msg) => {
  console.log(`  ${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const filas = async (sql, valores = []) => (await db.query(sql, valores)).rows;
const promptSql = async () => (await filas("select prompt_vigente() as p"))[0].p;

const carpeta = mkdtempSync(join(tmpdir(), "prompt-vigente-"));
await db.query("begin");
try {
  console.log("\n[1] La misma plantilla por los dos caminos da el mismo prompt");
  const [base] = await filas("select texto from prompt_base limit 1");
  if (!base) {
    console.log("  ⚠️  prompt_base está vacía: no hay nada que comparar todavía.");
  } else {
    const plantilla = join(carpeta, "plantilla.md");
    const salida = join(carpeta, "de-node.md");
    writeFileSync(plantilla, base.texto, "utf8");
    // El generador lee reglas_agente y contexto_agente de la misma base, así que los dos lados
    // parten de los mismos datos.
    execFileSync(process.execPath, ["scripts/armar-prompt.mjs", "--plantilla", plantilla, "--salida", salida], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const deNode = (await import("node:fs")).readFileSync(salida, "utf8");
    const deSql = await promptSql();
    if (deSql !== deNode) {
      const a = (deSql ?? "").split("\n");
      const b = deNode.split("\n");
      console.log(`     sql ${a.length} líneas / node ${b.length}`);
      let mostradas = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && mostradas < 4; i++) {
        if (a[i] !== b[i]) {
          mostradas++;
          console.log(`     línea ${i + 1}:\n       sql : ${JSON.stringify(a[i])}\n       node: ${JSON.stringify(b[i])}`);
        }
      }
    }
    assert(deSql === deNode, `idéntico carácter por carácter (${deSql?.length ?? 0} caracteres)`);
  }

  console.log("\n[2] Lo que cambia la dueña se ve en el prompt");
  const antes = await promptSql();
  await db.query("update contexto_agente set valor = 'Hablás como una amiga que sabe de trajes' where clave = 'tono'");
  const despues = await promptSql();
  assert(
    despues?.includes("Hablás como una amiga que sabe de trajes.") && despues !== antes,
    "cambiar el tono cambia el prompt, y le pone el punto final que le falta",
  );
  await db.query("update reglas_agente set activo = false where numero = (select min(numero) from reglas_agente)");
  assert((await promptSql()).length < despues.length, "apagar una regla la saca del prompt");

  console.log("\n[3] Antes que un prompt roto, ninguno (el que llama usa el prompt.md de la función)");
  const conTexto = async (texto, msg) => {
    await db.query("savepoint s");
    await db.query("update prompt_base set texto = $1", [texto]);
    assert((await promptSql()) === null, msg);
    await db.query("rollback to savepoint s");
  };
  await conTexto("Sos Lucía, y atendés.\n\n{{CONTEXTO:no_existe}}\n", "un marcador sin resolver");
  await conTexto("Sos Pedro, y atendés.\n", "un prompt que no arranca con «Sos Lucía,»");
  await conTexto("   \n", "una plantilla vacía");
  await db.query("savepoint s2");
  await db.query("delete from reglas_agente");
  assert((await promptSql()) === null, "sin reglas cargadas");
  await db.query("rollback to savepoint s2");
  await db.query("savepoint s3");
  await db.query("delete from prompt_base");
  assert((await promptSql()) === null, "sin plantilla cargada");
  await db.query("rollback to savepoint s3");

  console.log("\n[4] Los comentarios de la plantilla se sacan igual que en el generador");
  const comoJs = (t) => t.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n?/gm, "").replace(/<!--[\s\S]*?-->/g, "");
  const casos = [
    "a\n<!-- una -->\n<!-- dos seguida -->\nb\n   <!-- tres\n   sigue -->   \nc\nd <!-- al medio --> e\n",
    "<!--arriba-->\nSos Lucía,\n",
    "sin comentarios\n",
    "  <!--c--> con texto al lado\n",
    "<!-- sin cerrar\n",
  ];
  for (const [i, caso] of casos.entries()) {
    const [{ r }] = await filas("select prompt_sin_comentarios($1) as r", [caso]);
    assert(r === comoJs(caso), `caso ${i + 1}: ${JSON.stringify(caso.slice(0, 34))}…`);
  }

  console.log("\n[5] Quién puede pedirlo");
  const [{ g }] = await filas(
    `select coalesce(string_agg(grantee, ', ' order by grantee), '(ninguno)') as g
       from information_schema.routine_privileges
      where routine_name = 'prompt_vigente' and privilege_type = 'EXECUTE'`,
  );
  assert(!g.includes("anon") && !g.includes("PUBLIC"), `anon no: ${g}`);
} catch (err) {
  console.error("\n💥 Error inesperado:", err?.stdout?.toString?.() || err);
  fallas++;
} finally {
  await db.query("rollback");
  await db.end();
  rmSync(carpeta, { recursive: true, force: true });
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ 0050: el prompt que lee Lucía sale de la base y coincide con el generador.");
process.exit(fallas ? 1 : 0);
