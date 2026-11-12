// Seguimiento de 23 horas (Mateo, 3/11): cuándo sale y qué texto lleva. Sin base: son funciones puras.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { momentoDelSeguimiento, tocaElSeguimiento } from "../../supabase/functions/_shared/seguimiento/momento.ts";
import { etapaDelSeguimiento, fraseDelEvento, textoDelSeguimiento } from "../../supabase/functions/_shared/seguimiento/texto.ts";

const TZ = "America/Argentina/Cordoba";
const ar = (s: string) => new Date(`${s}-03:00`);
const cuando = (ultimo: string) => momentoDelSeguimiento(ar(ultimo), TZ).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16);

Deno.test("seguimiento: a las 23 horas exactas si caen entre las 9 y las 21", () => {
  assertEquals(cuando("2030-06-10T10:00:00"), "2030-06-11 09:00");
  assertEquals(cuando("2030-06-10T14:30:00"), "2030-06-11 13:30");
  assertEquals(cuando("2030-06-10T20:40:00"), "2030-06-11 19:40");
});

Deno.test("seguimiento: si las 23 horas caen de noche, la última tarde antes de las 21", () => {
  assertEquals(cuando("2030-06-10T22:30:00"), "2030-06-11 20:45"); // marca 21:30
  assertEquals(cuando("2030-06-10T21:50:00"), "2030-06-11 20:45"); // marca 20:50: la última corrida es la de 20:45
  assertEquals(cuando("2030-06-10T03:00:00"), "2030-06-10 20:45"); // marca 02:00 del 11: sale la tarde anterior
});

Deno.test("seguimiento: si el momento de la mañana todavía entra en la ventana, sale a las 9", () => {
  assertEquals(cuando("2030-06-10T09:30:00"), "2030-06-11 09:00"); // marca 08:30, la ventana cierra 09:25 → 09:00 entra
});

Deno.test("seguimiento: nunca antes de las 9 ni a partir de las 21, ni con la ventana cerrada", () => {
  const ultimo = ar("2030-06-10T22:30:00"); // le toca el 11 a las 20:45
  assertEquals(tocaElSeguimiento(ultimo, ar("2030-06-11T20:30:00"), TZ), false);
  assertEquals(tocaElSeguimiento(ultimo, ar("2030-06-11T20:45:00"), TZ), true);
  assertEquals(tocaElSeguimiento(ultimo, ar("2030-06-11T21:00:00"), TZ), false); // fuera de 9 a 21
  assertEquals(tocaElSeguimiento(ar("2030-06-10T10:00:00"), ar("2030-06-11T09:00:00"), TZ), true);
  assertEquals(tocaElSeguimiento(ar("2030-06-10T10:00:00"), ar("2030-06-11T09:56:00"), TZ), false); // ventana cerrada (menos margen)
});

Deno.test("seguimiento: la etapa sale de lo que sabe la base, no solo del modelo", () => {
  const sin = { vaAConsultar: false, dioFechaOMes: false };
  assertEquals(etapaDelSeguimiento(sin, { buscoHorarios: false, tieneFecha: false }), "sin_fecha");
  assertEquals(etapaDelSeguimiento({ ...sin, dioFechaOMes: true }, { buscoHorarios: false, tieneFecha: false }), "con_fecha");
  assertEquals(etapaDelSeguimiento(sin, { buscoHorarios: false, tieneFecha: true }), "con_fecha");
  // el modelo no puede decir «horarios» si Lucía nunca los buscó (el caso de Alex)
  assertEquals(etapaDelSeguimiento(sin, { buscoHorarios: true, tieneFecha: true }), "horarios");
  assertEquals(etapaDelSeguimiento({ ...sin, vaAConsultar: true }, { buscoHorarios: true, tieneFecha: true }), "consulta");
});

Deno.test("seguimiento: el nombre entra en el saludo, y sin nombre queda «Hola!»", () => {
  assertEquals(textoDelSeguimiento("Hola {nombre}! Pudiste pensarlo?", "nico perez"), "Hola Nico! Pudiste pensarlo?");
  assertEquals(textoDelSeguimiento("Hola {nombre}! Pudiste pensarlo?", null), "Hola! Pudiste pensarlo?");
  // 12/11: un perfil que no es un nombre no entra en el saludo.
  assertEquals(textoDelSeguimiento("Hola {nombre}! Pudiste pensarlo?", "🎸🎸crifrock73🎸🎸"), "Hola! Pudiste pensarlo?");
  assertEquals(textoDelSeguimiento("Hola {nombre}! Pudiste pensarlo?", "Solci🩷"), "Hola Solci! Pudiste pensarlo?");
});

Deno.test("seguimiento: «{evento}» nombra la fecha de la ficha si no pasó, y se saca sin ella (10/11)", () => {
  const ahora = ar("2030-06-11T12:00:00");
  assertEquals(fraseDelEvento("2030-12-14", ahora, TZ), "Tu evento es el sábado 14 de diciembre.");
  assertEquals(fraseDelEvento("2030-06-11", ahora, TZ), "Tu evento es el martes 11 de junio."); // hoy todavía cuenta
  assertEquals(fraseDelEvento("2030-06-10", ahora, TZ), null); // ya pasó
  assertEquals(fraseDelEvento(null, ahora, TZ), null);
  const plantilla = "Hola {nombre}! Te sirvió alguno? {evento} Si no, decime qué días te quedan bien.";
  assertEquals(textoDelSeguimiento(plantilla, "nico", "Tu evento es el sábado 14 de diciembre."), "Hola Nico! Te sirvió alguno? Tu evento es el sábado 14 de diciembre. Si no, decime qué días te quedan bien.");
  assertEquals(textoDelSeguimiento(plantilla, "nico", null), "Hola Nico! Te sirvió alguno? Si no, decime qué días te quedan bien.");
});
