// Derivación dura por código (derivacion_dura.ts): código puro, sin base. Desde el 9/10 queda solo la
// del evento inminente; el filtro por palabra clave se sacó (pedido de Mateo: lo decide Lucía).

import { assertEquals } from "jsr:@std/assert@1.0.13";
import * as dura from "../../supabase/functions/_shared/turno/derivacion_dura.ts";

const TZ = "America/Argentina/Cordoba";
// Viernes 9/10/2026, 15:00 en Rosario.
const AHORA = new Date("2026-10-09T18:00:00Z");

Deno.test("evento hoy o mañana: deriva al local", () => {
  assertEquals(dura.derivacionDuraPorEventoInminente("2026-10-09", AHORA, TZ)?.motivo, "evento_inminente");
  assertEquals(dura.derivacionDuraPorEventoInminente("2026-10-10", AHORA, TZ)?.motivo, "evento_inminente");
});

Deno.test("evento pasado mañana, ya pasado o sin fecha: no deriva", () => {
  assertEquals(dura.derivacionDuraPorEventoInminente("2026-10-11", AHORA, TZ), null);
  assertEquals(dura.derivacionDuraPorEventoInminente("2026-10-08", AHORA, TZ), null);
  assertEquals(dura.derivacionDuraPorEventoInminente(null, AHORA, TZ), null);
});

Deno.test("ya no hay filtro por palabra clave: «reclamo», «manchado» o «uniforme» los decide Lucía", () => {
  assertEquals("derivacionDuraPorPalabraClave" in dura, false);
});
