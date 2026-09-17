// Derivación dura por palabra clave (CLAUDE.md § 2, derivacion_dura.ts): código puro, sin base.
// Hallazgo de la auditoría del 17/9: el patrón de prenda_danada tenía la ñ literal, pero corre
// sobre normalizar(mensaje) (sin acentos ni ñ), así que nunca disparaba. No tenía ningún test.

import { assertEquals } from "jsr:@std/assert@1.0.13";
import { derivacionDuraPorPalabraClave } from "../../supabase/functions/_shared/turno/derivacion_dura.ts";

Deno.test("prenda_danada dispara con dañado/dañada/dañó/daños, con o sin tilde/ñ", () => {
  for (
    const m of [
      "les traigo el saco dañado",
      "la prenda está dañada",
      "se me dañó el pantalón",
      "tengo daños en el traje",
      "la prenda esta danada",
      "se me dano el pantalon",
    ]
  ) {
    assertEquals(derivacionDuraPorPalabraClave(m)?.motivo, "prenda_danada", `no disparó con: ${m}`);
  }
});

Deno.test("prenda_danada no confunde con el verbo dar (dan/dando), caso parecido", () => {
  for (const m of ["me dan ganas de comprar", "me lo van dando de a poco", "cuántos turnos dan por día"]) {
    assertEquals(derivacionDuraPorPalabraClave(m), null, `disparó de más con: ${m}`);
  }
});

Deno.test("reclamo, corporativo y uniforme siguen disparando (caso parecido, no se rompieron con el arreglo)", () => {
  assertEquals(derivacionDuraPorPalabraClave("quiero hacer un reclamo")?.motivo, "reclamo");
  assertEquals(derivacionDuraPorPalabraClave("somos un evento corporativo")?.motivo, "corporativo");
  assertEquals(derivacionDuraPorPalabraClave("necesitamos uniformes para el staff")?.motivo, "corporativo");
});

Deno.test("sin ninguna palabra clave, no dispara", () => {
  assertEquals(derivacionDuraPorPalabraClave("hola, quiero ver trajes para un casamiento"), null);
});
