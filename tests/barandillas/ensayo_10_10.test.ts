// Los controles que el ensayo de 44 charlas reales del 10/10 (trabajo 3) encontró frenando frases
// que estaban bien. Cada prueba tiene el caso real y su contracara: lo que el control sí tiene que
// seguir frenando.

import { assertEquals } from "jsr:@std/assert@1.0.13";
import { confirmacionDoble } from "../../supabase/functions/_shared/barandillas/chequeos/confirmacion_doble.ts";
import { disponibilidadNegada } from "../../supabase/functions/_shared/barandillas/chequeos/disponibilidad_negada.ts";
import { mencionaIa } from "../../supabase/functions/_shared/barandillas/chequeos/menciona_ia.ts";
import { montos } from "../../supabase/functions/_shared/barandillas/chequeos/precio_sin_herramienta.ts";
import { entrada, traza } from "./_ayuda.ts";

Deno.test("un talle dicho con palabras en el medio no es un precio; un precio al lado de un talle, sí", () => {
  assertEquals(montos("Anoté tu talle aproximado de pantalón, 46. ¿Para qué evento lo necesitás?"), []);
  assertEquals(montos("Para el 56/58 de pantalón, el calce se confirma en la prueba."), []);
  assertEquals(montos("Tenemos el pantalón 48 y el saco talle 52."), []);
  assertEquals(montos("Talle M y el alquiler sale 150."), [150]);
  assertEquals(montos("El saco sale 120."), [120]);
});

Deno.test("«no hay descuento por dos» es una política, no falta de stock", async () => {
  const texto = "No tenemos un descuento aprobado por dos alquileres. Si querés, le consulto al equipo.";
  assertEquals((await disponibilidadNegada.evaluar(entrada(texto))).salta, false);
  assertEquals((await disponibilidadNegada.evaluar(entrada("No tenemos ese modelo en azul."))).salta, true);
});

Deno.test("«las 15:30 no están disponibles» con otros horarios buscados en la agenda no se frena", async () => {
  const texto = "Luciana, las 15:30 no están disponibles. Tengo lugar el sábado a las 14:45 o a las 16:15, ¿cuál te queda mejor?";
  const conAgenda = entrada(texto, { traza: traza({ herramientas: ["buscar_horarios"] }) });
  assertEquals((await disponibilidadNegada.evaluar(conAgenda)).salta, false);
  const otro = "Revisé la agenda: para el 10 y el 17 no hay turnos libres, pero el sábado 24 tenemos a las 9:30 o 13:15.";
  assertEquals((await disponibilidadNegada.evaluar(entrada(otro, { traza: traza({ herramientas: ["buscar_horarios"] }) }))).salta, false);
  // Sin haber mirado la agenda, o sin ofrecer otro horario, sigue frenando.
  assertEquals((await disponibilidadNegada.evaluar(entrada(texto))).salta, true);
  const sinAlternativa = entrada("No hay turnos esa semana.", { traza: traza({ herramientas: ["buscar_horarios"] }) });
  assertEquals((await disponibilidadNegada.evaluar(sinAlternativa)).salta, true);
});

Deno.test("«no me figura un turno a tu nombre» es una frase de mostrador; «no me figura ese precio», no", async () => {
  for (const texto of [
    "Enrique, no me figura un turno a tu nombre para hoy. ¿Lo sacaste a tu nombre o al de otra persona?",
    "Hola, Mauri! No me figura ningún turno activo. ¿Lo reservaste por otro lado?",
  ]) assertEquals((await mencionaIa.evaluar(entrada(texto))).salta, false, texto);
  for (const texto of ["No me figura ese precio.", "Eso no figura en el sistema."]) {
    assertEquals((await mencionaIa.evaluar(entrada(texto))).salta, true, texto);
  }
});

Deno.test("la cortesía suelta antes del resumen del turno se saca; lo que dice algo más, no", async () => {
  const agendo = { traza: traza({ herramientas: ["agendar_turno"] }) };
  for (const texto of ["¡Te esperamos, Jaz!", "Te esperamos con tu hijo, Marisa!", "Gracias, Walter. Te esperamos!"]) {
    const r = await confirmacionDoble.evaluar(entrada(texto, agendo));
    assertEquals(r.salta && r.texto, "", texto);
  }
  const confirmo = { traza: traza({ herramientas: ["cambiar_turno:confirmar"] }) };
  const r = await confirmacionDoble.evaluar(entrada("Gracias, Walter. Te esperamos!", confirmo));
  assertEquals(r.salta && r.texto, "");
  // Información nueva junto a la cortesía: queda.
  const conDato = await confirmacionDoble.evaluar(entrada("¡Te esperamos! Podés venir con un acompañante.", agendo));
  assertEquals(conDato.salta && conDato.texto, "Podés venir con un acompañante.");
  // Sin una confirmación armada en código, la cortesía no se toca.
  assertEquals((await confirmacionDoble.evaluar(entrada("¡Te esperamos, Jaz!"))).salta, false);
});
