// Que las barandillas no se desalineen de lo que dicen el prompt y AGENTE.md: las fórmulas de
// relleno que prohíbe el prompt son las que corta sin_relleno, y las de AGENTE.md § 6 son las
// del código, en el mismo orden y cada una en su archivo (TRABAJO.md § 5).

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { BARANDILLAS } from "../../supabase/functions/_shared/barandillas/index.ts";
import { FORMULAS_DE_RELLENO } from "../../supabase/functions/_shared/barandillas/sin_relleno.ts";
import { normalizar } from "../../supabase/functions/_shared/barandillas/texto.ts";

const leer = (ruta: string) => Deno.readTextFileSync(new URL(ruta, import.meta.url)).replace(/\r\n?/g, "\n");

Deno.test("las fórmulas de relleno que prohíbe el prompt están todas en sin_relleno", () => {
  const prompt = leer("../../supabase/functions/_shared/prompt.md");
  const desde = prompt.indexOf("Prohibidas:");
  const hasta = prompt.indexOf("Un chat real", desde);
  assert(desde > 0 && hasta > desde, "el prompt ya no tiene la lista de fórmulas prohibidas");
  const delPrompt = [...prompt.slice(desde, hasta).matchAll(/«([^»]+)»/g)].map((m) => normalizar(m[1]));
  assert(delPrompt.length >= 8);
  const faltan = delPrompt.filter((f) => !FORMULAS_DE_RELLENO.includes(f));
  assertEquals(faltan, [], "fórmulas del prompt que la barandilla no corta");
});

Deno.test("las barandillas de AGENTE.md § 6 son las del código, en el mismo orden y cada una en su archivo", () => {
  const agente = leer("../../AGENTE.md");
  const inicio = agente.search(/^## 6\. /m);
  const fin = agente.slice(inicio + 1).search(/^## \d+\. /m) + inicio + 1;
  const doc = [...agente.slice(inicio, fin).matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
  const codigo = BARANDILLAS.map((b) => b.nombre);
  assertEquals(doc, codigo, "mismo orden que la tabla de AGENTE.md § 6");
  for (const nombre of codigo) {
    const archivo = new URL(`../../supabase/functions/_shared/barandillas/${nombre}.ts`, import.meta.url);
    assert(Deno.statSync(archivo).isFile, `falta ${nombre}.ts`);
  }
});
