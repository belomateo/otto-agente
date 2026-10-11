// Los controles de cordura de las instrucciones (_shared/instrucciones.ts, corrector de Lucía 10/10):
// el prompt.md publicado los pasa, y lo que rompió a Lucía cuando sus instrucciones vivían en la base
// (47 caracteres el 16/9) no. Puro: sin red ni base.
//   env -u OPENAI_API_KEY deno test tests/corrector --allow-all --no-lock --node-modules-dir=none

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1.0.13";
import {
  controlarContraLaBase,
  controlarInstrucciones,
  encabezados,
  formulasProhibidas,
  huellaDe,
  MAXIMO_LINEAS,
  seccionesDelMapa,
} from "../../supabase/functions/_shared/instrucciones.ts";
import { SECCIONES } from "../../supabase/functions/_shared/enums.ts";

const PROMPT = Deno.readTextFileSync(new URL("../../supabase/functions/_shared/prompt.md", import.meta.url)).replace(/\r\n?/g, "\n");

const hay = (problemas: string[], parte: string) => problemas.some((p) => p.includes(parte));

Deno.test("el prompt.md publicado pasa todos los controles", () => {
  assertEquals(controlarInstrucciones(PROMPT), []);
  assertEquals(encabezados(PROMPT).map((e) => e.numero), [1, 2, 3, 4, 5]);
  assertEquals([...(seccionesDelMapa(PROMPT) ?? [])].sort(), [...SECCIONES].sort());
  assert((formulasProhibidas(PROMPT) ?? []).length >= 8);
});

Deno.test("con finales de línea de Windows también pasa (el archivo se puede guardar con CRLF)", () => {
  assertEquals(controlarInstrucciones(PROMPT.replace(/\n/g, "\r\n")), []);
});

Deno.test("47 caracteres no son instrucciones (lo que pasó el 16/9 con la plantilla de la base)", () => {
  const p = controlarInstrucciones("Sos Lucía, del equipo de Mr Otto. Hola, ¿cómo va?");
  assert(hay(p, "muy cortas"), p.join(" | "));
  assert(hay(p, "MAPA"), p.join(" | "));
  assertEquals(controlarInstrucciones("  \n"), ["las instrucciones están vacías"]);
});

Deno.test("tiene que empezar con «Sos Lucía,»", () => {
  assert(hay(controlarInstrucciones(`Hola.\n${PROMPT}`), "Sos Lucía,"));
});

Deno.test("sin el mapa, o con una sección de menos o de más, no pasa", () => {
  const sinMapa = PROMPT.replace("MAPA DE LA BASE DE CONOCIMIENTO", "LO QUE PODÉS CONSULTAR");
  assert(hay(controlarInstrucciones(sinMapa), "falta el MAPA"));
  const sinTalles = PROMPT.replace(/^- talles: .*\n/m, "");
  assert(hay(controlarInstrucciones(sinTalles), "le faltan secciones: talles"));
  const conOtra = PROMPT.replace(/^(- talles: .*\n)/m, "$1- estacionamiento: dónde dejar el auto.\n");
  assert(hay(controlarInstrucciones(conOtra), "secciones que no existen: estacionamiento"));
});

Deno.test("los cierres prohibidos: tienen que estar y el control de relleno los tiene que cortar", () => {
  const sinLista = PROMPT.replace("Prohibidas:", "Evitá:");
  assert(hay(controlarInstrucciones(sinLista), "cierres prohibidos"));
  const conUnaNueva = PROMPT.replace("«cordialmente»", "«cordialmente», «abrazo grande»");
  assert(hay(controlarInstrucciones(conUnaNueva), "abrazo grande"));
});

Deno.test("secciones numeradas, en orden; sin marcadores sin resolver; no más de 300 líneas", () => {
  const sinSecciones = PROMPT.replace(/^\d\. ([A-ZÁÉÍÓÚÑ ]+)$/gm, "$1");
  assert(hay(controlarInstrucciones(sinSecciones), "faltan secciones numeradas"));
  const desordenadas = PROMPT.replace("4. LO QUE NUNCA HACÉS", "6. LO QUE NUNCA HACÉS");
  assert(hay(controlarInstrucciones(desordenadas), "no van numeradas en orden"));
  assert(hay(controlarInstrucciones(`${PROMPT}\n{{REGLAS_NUMERADAS}}\n`), "marcador"));
  const larguisimo = `${PROMPT}${"Una línea más.\n".repeat(MAXIMO_LINEAS)}`;
  assert(hay(controlarInstrucciones(larguisimo), "líneas"));
});

Deno.test("contra la base: no se pierde ninguna sección ni se achica o crece de golpe", () => {
  assertEquals(controlarContraLaBase(PROMPT.replace("Una sola pregunta por mensaje, al final.", "Una sola pregunta por mensaje."), PROMPT), []);
  const sinSeccion = PROMPT.replace("5. DATOS DEL LOCAL", "DATOS DEL LOCAL");
  assert(hay(controlarContraLaBase(sinSeccion, PROMPT), "«5. DATOS DEL LOCAL»"));
  const mitad = PROMPT.slice(0, Math.floor(PROMPT.length / 2));
  assert(hay(controlarContraLaBase(mitad, PROMPT), "achicaría"));
  assert(hay(controlarContraLaBase(PROMPT + "x".repeat(7000), PROMPT), "crecería"));
});

Deno.test("la huella: la misma para el mismo texto (con o sin CRLF), otra si cambia una letra", async () => {
  const a = await huellaDe(PROMPT);
  assertEquals(a.length, 64);
  assertEquals(await huellaDe(PROMPT.replace(/\n/g, "\r\n")), a);
  assertNotEquals(await huellaDe(PROMPT.replace("Sos Lucía,", "Sos Lucia,")), a);
});
