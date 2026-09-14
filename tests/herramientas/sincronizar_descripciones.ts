// Pasa a herramientas_agente (paneles, 0013) las descripciones de _shared/herramientas: son lo
// que lee el modelo, y el panel las muestra para que el dueño las edite. Solo toca las filas
// que no editó una persona (editado_por vacío o de un seed): lo que editó el dueño no se pisa.
// Deja historial (el trigger de la tabla) y firma 'seed H1.4 (agente)'.
//
//   deno run --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env \
//     tests/herramientas/sincronizar_descripciones.ts            muestra qué cambiaría
//   … tests/herramientas/sincronizar_descripciones.ts --aplicar  lo escribe

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { HERRAMIENTAS } from "../../supabase/functions/_shared/herramientas/index.ts";

const AUTOR = "seed H1.4 (agente)";
const aplicar = Deno.args.includes("--aplicar");
const url = Deno.env.get("SUPABASE_DB_URL");
if (!url) {
  console.error("Falta SUPABASE_DB_URL: corré con --env-file=.env");
  Deno.exit(1);
}

const sql = new pg.Client({ connectionString: url });
await sql.connect();
let problemas = 0;
try {
  await sql.query("begin");
  const filas = (await sql.query("select nombre, tipo, descripcion, editado_por from herramientas_agente")).rows;
  const porNombre = new Map(filas.map((f) => [String(f.nombre), f]));
  for (const h of HERRAMIENTAS) {
    const f = porNombre.get(h.nombre);
    if (!f) {
      console.log(`✗ ${h.nombre}: no está en herramientas_agente (la carga paneles)`);
      problemas++;
      continue;
    }
    if (f.tipo !== h.tipo) {
      console.log(`✗ ${h.nombre}: en la base es "${f.tipo}" y en el código "${h.tipo}"`);
      problemas++;
    }
    if (String(f.descripcion) === h.descripcion) {
      console.log(`= ${h.nombre}: igual`);
      continue;
    }
    const deUnaPersona = f.editado_por !== null && !String(f.editado_por).startsWith("seed");
    if (deUnaPersona) {
      console.log(`· ${h.nombre}: la editó ${f.editado_por}, no se pisa`);
      continue;
    }
    console.log(`${aplicar ? "✓" : "→"} ${h.nombre}: ${aplicar ? "actualizada" : "se actualizaría"}`);
    if (aplicar) {
      await sql.query("update herramientas_agente set descripcion = $2, editado_por = $3 where nombre = $1", [
        h.nombre,
        h.descripcion,
        AUTOR,
      ]);
    }
  }
  await sql.query(aplicar && problemas === 0 ? "commit" : "rollback");
  if (!aplicar) console.log("\n(sin --aplicar no se escribió nada)");
} catch (e) {
  await sql.query("rollback");
  throw e;
} finally {
  await sql.end();
}
if (problemas) Deno.exit(1);
