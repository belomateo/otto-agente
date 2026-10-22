// La prueba final (pedido de Sofía, 22/10): el último día abierto antes del evento, arrancando entre las 11:00
// y las 17:30. calcularHuecos es pura: no necesita base.

import { assertEquals } from "jsr:@std/assert@1.0.13";
import { calcularHuecos, type ReglasAgenda } from "../../supabase/functions/_shared/agenda/huecos.ts";

const TZ = "America/Argentina/Cordoba";
const h = (hh: number, mm = 0) => hh * 60 + mm;
// Lunes a viernes 10 a 19, sábado 9:30 a 18:30, domingo cerrado.
const franjas = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, desde: h(10), hasta: h(19), probadores: 1 }))
  .concat([{ diaSemana: 6, desde: h(9, 30), hasta: h(18, 30), probadores: 1 }]);
const reglas = (pruebaFinal: boolean): ReglasAgenda => ({ // la ventana de producción (0108): 11:00 a 17:30
  franjas, escalonadoMin: 30, diasReservaUrgencia: null, duracionMin: 30, diasConfeccion: 1, diasSimultaneos: [], pruebaFinal: pruebaFinal ? { desde: h(11), hasta: h(17, 30) } : null,
});
const huecos = (pruebaFinal: boolean, fechaEvento: string, cerrados: string[] = []) =>
  calcularHuecos(reglas(pruebaFinal), [], {
    desde: "2026-11-01", hasta: "2026-11-30", ahora: new Date("2026-10-22T12:00:00-03:00"), fechaEvento, tz: TZ,
    cerrados: new Set(cerrados), bloqueos: [],
  }).huecos.map((x) => new Date(x.inicio).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16));

Deno.test("prueba final: el día antes del evento, de 11:00 a 17:30", () => {
  const r = huecos(true, "2026-11-27"); // viernes → jueves 26
  assertEquals(r[0], "2026-11-26 11:00");
  assertEquals(r[r.length - 1], "2026-11-26 17:30");
  assertEquals(r.every((x) => x.startsWith("2026-11-26")), true);
});

Deno.test("prueba final: evento el lunes → el sábado (el domingo está cerrado); un feriado también se saltea", () => {
  assertEquals(huecos(true, "2026-11-30").every((x) => x.startsWith("2026-11-28")), true); // lunes 30 → sábado 28
  assertEquals(huecos(true, "2026-11-27", ["2026-11-26"]).every((x) => x.startsWith("2026-11-25")), true);
});

Deno.test("sin la regla (el panel) se ofrece cualquier hora y cualquier día", () => {
  const r = huecos(false, "2026-11-27");
  assertEquals(r[0], "2026-11-02 10:00");
});
