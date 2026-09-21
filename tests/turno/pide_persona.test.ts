// Pide hablar con una persona, por palabra clave (CLAUDE.md § 2, pide_persona.ts): código puro,
// sin base. Pedido de Mateo, 21/9: es una de las dos ÚNICAS razones para que Lucía se calle en
// una charla ya derivada (la otra es cliente_enojado/reclamo, ya cubierta por
// derivacion_dura.ts). Deliberadamente angosto: un falso positivo acá vuelve a dejar a alguien
// sin respuesta, que es justo el problema que se está arreglando.

import { assertEquals } from "jsr:@std/assert@1.0.13";
import { pidePersonaPorPalabraClave } from "../../supabase/functions/_shared/turno/pide_persona.ts";

Deno.test("dispara con un pedido explícito de hablar con una persona", () => {
  for (
    const m of [
      "quiero hablar con una persona",
      "necesito hablar con alguien del local",
      "prefiero que me atienda una persona",
      "pasame con alguien, por favor",
      "no quiero hablar con un bot",
      "hablame con una persona, dale",
    ]
  ) {
    assertEquals(pidePersonaPorPalabraClave(m), true, `no disparó con: ${m}`);
  }
});

Deno.test("no confunde una mención de \"persona\" o \"equipo\" que no es un pedido de hablar con alguien (caso parecido)", () => {
  for (
    const m of [
      "somos dos personas para el casamiento",
      "el equipo del local me atendió bien",
      "una persona me recomendó el local",
      "hola, quiero ver trajes para un casamiento",
      "¿cuánto sale para tres personas?",
    ]
  ) {
    assertEquals(pidePersonaPorPalabraClave(m), false, `disparó de más con: ${m}`);
  }
});
