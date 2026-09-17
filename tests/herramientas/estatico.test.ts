// Controles 1 y 4 del hito 1.4, sin base: cada herramienta es un archivo con nombre,
// descripción, schema estricto y precondiciones; y en _shared/herramientas no hay ningún
// precio, horario, duración ni link escrito a mano (todo eso sale de tablas).

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { HERRAMIENTAS } from "../../supabase/functions/_shared/herramientas/index.ts";

const DIR = new URL("../../supabase/functions/_shared/herramientas/", import.meta.url);

Deno.test("cada herramienta es su propio archivo, con descripción, schema estricto y ejecutar", () => {
  const nombres = new Set<string>();
  for (const h of HERRAMIENTAS) {
    assert(!nombres.has(h.nombre), `${h.nombre} está dos veces`);
    nombres.add(h.nombre);
    const archivo = new URL(`${h.nombre}.ts`, DIR);
    assert(Deno.statSync(archivo).isFile, `falta ${h.nombre}.ts`);
    assert(Deno.readTextFileSync(archivo).includes(`nombre: "${h.nombre}"`), `${h.nombre}.ts no define esa herramienta`);
    assert(h.descripcion.length >= 60, `${h.nombre}: la descripción es lo que lee el modelo, está muy corta`);
    assert(["consulta", "accion"].includes(h.tipo));
    const p = h.parametros as { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
    assertEquals(p.type, "object", h.nombre);
    assertEquals(p.additionalProperties, false, h.nombre);
    assertEquals([...p.required].sort(), Object.keys(p.properties).sort(), `${h.nombre}: modo estricto pide todo en required`);
    assertEquals(typeof h.ejecutar, "function");
  }
});

Deno.test("en _shared/herramientas no hay precios, horarios, duraciones ni links escritos a mano", () => {
  const prohibidos: [string, RegExp][] = [
    // Un monto en pesos ($150.000, $ 150000, $100). Los $1, $2 del SQL no son precios.
    ["un precio", /\$\s?\d{1,3}(\.\d{3})+|\$\s?\d{3,}/],
    ["un número de cinco cifras o más", /\b\d{5,}\b/],
    ["un horario hh:mm", /\b\d{1,2}:\d{2}\b/],
    ["una duración", /\b\d+\s*(min|minutos|hs|horas)\b/i],
    ["un link", /https?:\/\/|www\./i],
  ];
  const hallazgos: string[] = [];
  for (const entrada of Deno.readDirSync(DIR)) {
    if (!entrada.isFile || !entrada.name.endsWith(".ts")) continue;
    const lineas = Deno.readTextFileSync(new URL(entrada.name, DIR)).split("\n");
    lineas.forEach((linea, i) => {
      for (const [que, re] of prohibidos) if (re.test(linea)) hallazgos.push(`${entrada.name}:${i + 1} tiene ${que}: ${linea.trim()}`);
    });
  }
  assertEquals(hallazgos, []);
});
