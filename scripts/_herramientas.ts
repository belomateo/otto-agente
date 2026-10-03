// Vuelca a JSON las herramientas de Lucía (nombre, tipo, parámetros y descripción del código), para
// que scripts/documento-lucia.mjs (node) las pueda listar sin importar TypeScript.
//   deno run --no-lock --node-modules-dir=none -A scripts/_herramientas.ts > herr.json
import { HERRAMIENTAS } from "../supabase/functions/_shared/herramientas/index.ts";

console.log(JSON.stringify(HERRAMIENTAS.map((h) => ({
  nombre: h.nombre,
  tipo: h.tipo,
  parametros: Object.keys((h.parametros as { properties?: Record<string, unknown> }).properties ?? {}),
  descripcion: h.descripcion,
}))));
