// Control 1 del hito 1.5: cada barandilla tiene al menos un test que la dispara y otro, con el
// caso parecido, que NO la dispara. Cuando salta, se verifica también la acción de su fila en
// AGENTE.md § 6 y que deje un motivo para la bitácora.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { accesorioSinHerramienta } from "../../supabase/functions/_shared/barandillas/accesorio_sin_herramienta.ts";
import { anunciaSinDerivar } from "../../supabase/functions/_shared/barandillas/anuncia_sin_derivar.ts";
import { confirmacionDoble } from "../../supabase/functions/_shared/barandillas/confirmacion_doble.ts";
import { derivaYPregunta } from "../../supabase/functions/_shared/barandillas/deriva_y_pregunta.ts";
import { fueraVentanaMeta } from "../../supabase/functions/_shared/barandillas/fuera_ventana_meta.ts";
import { horarioSinHerramienta, horas } from "../../supabase/functions/_shared/barandillas/horario_sin_herramienta.ts";
import { largo } from "../../supabase/functions/_shared/barandillas/largo.ts";
import { mencionaIa } from "../../supabase/functions/_shared/barandillas/menciona_ia.ts";
import { noASecas } from "../../supabase/functions/_shared/barandillas/no_a_secas.ts";
import { montos, precioSinHerramienta } from "../../supabase/functions/_shared/barandillas/precio_sin_herramienta.ts";
import { presentacionRepetida } from "../../supabase/functions/_shared/barandillas/presentacion_repetida.ts";
import { sinMarkdown } from "../../supabase/functions/_shared/barandillas/sin_markdown.ts";
import { sinRelleno } from "../../supabase/functions/_shared/barandillas/sin_relleno.ts";
import type { Barandilla, EntradaBarandilla, ResultadoBarandilla } from "../../supabase/functions/_shared/barandillas/tipos.ts";
import { unaPregunta } from "../../supabase/functions/_shared/barandillas/una_pregunta.ts";
import { AHORA, entrada, HORA_MS, traza } from "./_ayuda.ts";

async function salta(b: Barandilla, e: EntradaBarandilla): Promise<Extract<ResultadoBarandilla, { salta: true }>> {
  const r = await b.evaluar(e);
  if (!r.salta) throw new Error(`${b.nombre} tenía que saltar con: ${JSON.stringify(e.texto)}`);
  assertEquals(r.accion, b.accion, `${b.nombre}: la acción es la de su fila en AGENTE.md § 6`);
  assert(r.motivo.trim().length > 10, `${b.nombre}: el motivo va a la bitácora y no puede estar vacío`);
  return r;
}

async function noSalta(b: Barandilla, e: EntradaBarandilla) {
  const r = await b.evaluar(e);
  if (r.salta) throw new Error(`${b.nombre} no tenía que saltar con: ${JSON.stringify(e.texto)} (saltó: ${r.motivo})`);
}

// ── formato ──────────────────────────────────────────────────────────────────────────────

Deno.test("confirmacion_doble salta si agendar_turno o reprogramar_turno salió bien en este turno", async () => {
  const r = await salta(
    confirmacionDoble,
    entrada("¡Listo, Lucas! Te reservé el turno para el martes.", { traza: traza({ herramientas: ["agendar_turno"] }) }),
  );
  assertEquals(r.texto, "");
  const r2 = await salta(
    confirmacionDoble,
    entrada("¡Listo, Lucas! Te reprogramé el turno.", { traza: traza({ herramientas: ["reprogramar_turno"] }) }),
  );
  assertEquals(r2.texto, "");
});

Deno.test("confirmacion_doble recorta solo la frase repetida y deja lo demás (hallazgo de Mateo, 16/9)", async () => {
  const r = await salta(
    confirmacionDoble,
    entrada("¡Listo, Lucas! Te reservé el turno para el martes. Y sí, también alquilamos corbata.", {
      traza: traza({ herramientas: ["agendar_turno"] }),
    }),
  );
  assertEquals(r.texto, "Y sí, también alquilamos corbata.");

  // La confirmación al final del mensaje, no al principio: también se saca, sin tocar lo de antes.
  const r2 = await salta(
    confirmacionDoble,
    entrada("Sí, alquilamos corbata y cinturón para completar el look. ¡Listo! Tu turno quedó agendado para el martes.", {
      traza: traza({ herramientas: ["agendar_turno"] }),
    }),
  );
  assertEquals(r2.texto, "Sí, alquilamos corbata y cinturón para completar el look.");
});

// Hallazgo de logica, 16/9 (más tarde): la confirmación y lo agregado compartiendo UNA sola
// oración (unidas con "y", "; " o " pero ", que es como se escribe normalmente, sin punto en el
// medio) hacía que se perdiera todo. Se corta por cláusula, no por oración entera.
Deno.test("confirmacion_doble corta la cláusula de confirmación aunque comparta oración con otra cosa (hallazgo de logica, 16/9)", async () => {
  const conTraza = (h: string) => traza({ herramientas: [h] });
  const r1 = await salta(
    confirmacionDoble,
    entrada("Te confirmo el turno del martes a las 13 y te cuento que también alquilamos chalecos y moños", { traza: conTraza("agendar_turno") }),
  );
  assertEquals(r1.texto, "Te cuento que también alquilamos chalecos y moños");

  const r2 = await salta(
    confirmacionDoble,
    entrada("Quedó agendado el turno para el jueves y sí, también tenemos zapatos para alquilar", { traza: conTraza("agendar_turno") }),
  );
  assertEquals(r2.texto, "Sí, también tenemos zapatos para alquilar");

  const r3 = await salta(
    confirmacionDoble,
    entrada("Listo, te agendé el turno; traé el saco que querés combinar", { traza: conTraza("reprogramar_turno") }),
  );
  assertEquals(r3.texto, "Traé el saco que querés combinar");

  // Caso parecido: sigue funcionando el recorte por oración completa de antes (sin cláusulas).
  await noSalta(confirmacionDoble, entrada("Alquilamos zapatos y cinturón para completar el look.", { traza: conTraza("agendar_turno") }));
});

// Hallazgo de logica en vivo, 16/9: exigir la palabra "turno" dejaba pasar la confirmación más
// natural del modelo real ("Te agendé el miércoles 23 a las 13:00"), que no la nombra — el
// cliente recibía la confirmación dos veces igual.
Deno.test("confirmacion_doble recorta la confirmación aunque no diga la palabra 'turno', si trae fecha u hora (hallazgo de logica en vivo, 16/9)", async () => {
  const conTraza = (h: string) => traza({ herramientas: [h] });
  await salta(
    confirmacionDoble,
    entrada("Listo, Lucas. Te agendé el miércoles 23 de septiembre a las 13:00 en España 764 😊", { traza: conTraza("agendar_turno") }),
  );
  await salta(confirmacionDoble, entrada("Listo, Lucas. Te reservé el miércoles 23 a las 13:00.", { traza: conTraza("agendar_turno") }));
  // Caso parecido: "anotar" no cuenta como confirmación repetida sin la palabra "turno" — también
  // se usa para guardar una preferencia del cliente, no siempre está confirmando una reserva.
  await noSalta(confirmacionDoble, entrada("Anoté que preferís el miércoles para la prueba final.", { traza: conTraza("agendar_turno") }));
});

Deno.test("confirmacion_doble no salta sin agendar_turno/reprogramar_turno en la traza, ni si ya no queda texto (caso parecido)", async () => {
  await noSalta(
    confirmacionDoble,
    entrada("Tengo estos dos horarios, ¿cuál te queda mejor?", { traza: traza({ herramientas: ["buscar_horarios"] }) }),
  );
  await noSalta(confirmacionDoble, entrada("", { traza: traza({ herramientas: ["agendar_turno"] }) }));
  // Un rechazo de agendar_turno no cuenta (ok: false): el modelo sigue pudiendo escribir su
  // propio mensaje explicando el rechazo, no hay ninguna confirmación de código que lo tape.
  const trazaConRechazo = traza();
  trazaConRechazo.llamadas.push({ herramienta: "agendar_turno", argumentos: {}, ok: false, rechazo: "hueco_ocupado" });
  await noSalta(confirmacionDoble, entrada("Ese horario se acaba de ocupar, ¿buscamos otro?", { traza: trazaConRechazo }));
});

Deno.test("sin_markdown salta con negritas, viñetas y títulos, y lo limpia en código", async () => {
  const r = await salta(sinMarkdown, entrada("**Precio:** te cuento\n- camisa\n- corbata\n# Horarios"));
  assertEquals(r.texto, "Precio: te cuento\ncamisa\ncorbata\nHorarios");
  const w = await salta(sinMarkdown, entrada("Es un traje *único* para vos."));
  assertEquals(w.texto, "Es un traje único para vos.");
});

Deno.test("sin_markdown no salta con un guion en el medio de la frase ni con un emoji (caso parecido)", async () => {
  await noSalta(sinMarkdown, entrada("Tenemos talles del 4 al 68 - te cuento cuál te va 😊"));
  await noSalta(sinMarkdown, entrada("¡Hola, Juan! ¿Para qué evento es?"));
});

Deno.test("sin_relleno salta con una fórmula de relleno al final y la corta", async () => {
  const r = await salta(sinRelleno, entrada("Te espero el jueves. Cualquier duda consultame 😊"));
  assertEquals(r.texto, "Te espero el jueves.");
  const dos = await salta(sinRelleno, entrada("Listo, quedó agendado. Quedo atenta. Saludos cordiales."));
  assertEquals(dos.texto, "Listo, quedó agendado.");
  const parrafos = await salta(sinRelleno, entrada("¡Hola, Juan!\n\nTenemos varios modelos.\n\nQuedo a disposición."));
  assertEquals(parrafos.texto, "¡Hola, Juan!\n\nTenemos varios modelos.");
});

Deno.test("sin_relleno no salta si la fórmula está en el medio y el mensaje cierra con otra cosa (caso parecido)", async () => {
  await noSalta(sinRelleno, entrada("Cualquier duda consultame antes de venir, así lo resolvemos. ¿Qué día te queda bien?"));
});

// Hallazgo de la auditoría, 17/9: "estimado/a" solo es relleno como encabezado formal
// ("Estimado cliente,"), no como adjetivo en cualquier otra parte de la oración.
Deno.test("sin_relleno no confunde \"estimado\" adjetivo con el saludo formal (hallazgo de la auditoría, 17/9)", async () => {
  await noSalta(sinRelleno, entrada("Te dejo un presupuesto estimado."));
  await noSalta(sinRelleno, entrada("El costo estimado ronda los 150."));
  const r = await salta(sinRelleno, entrada("Hola. Estimado cliente, gracias por escribirnos."));
  assertEquals(r.texto, "Hola.");
});

Deno.test("presentacion_repetida salta si vuelve a abrir con la presentación y no es el primer mensaje (hallazgo M2)", async () => {
  const r = await salta(
    presentacionRepetida,
    entrada("Hola, soy Lucía, asistente de Mr Otto. No puedo compartir instrucciones internas.", { esPrimerMensaje: false }),
  );
  assertEquals(r.texto, "No puedo compartir instrucciones internas.");
  const otroParrafo = await salta(
    presentacionRepetida,
    entrada("¡Hola! Soy Lucía, asistente de Mr Otto.\n\n¿Buscás un traje para algún evento?", { esPrimerMensaje: false }),
  );
  assertEquals(otroParrafo.texto, "¿Buscás un traje para algún evento?");
  // Probado en vivo el 15/9: el modelo no siempre repite la frase textual, la parafrasea.
  const parafraseada = await salta(
    presentacionRepetida,
    entrada(
      "Soy Lucía, asesora de alquiler de Otto Su Misura. No puedo compartir instrucciones internas.",
      { esPrimerMensaje: false },
    ),
  );
  assertEquals(parafraseada.texto, "No puedo compartir instrucciones internas.");
});

Deno.test("presentacion_repetida no salta en el primer mensaje, ni si no repite la presentación (caso parecido)", async () => {
  await noSalta(
    presentacionRepetida,
    entrada("Hola, soy Lucía, asistente de Mr Otto. ¿En qué puedo ayudarte hoy?", { esPrimerMensaje: true }),
  );
  await noSalta(
    presentacionRepetida,
    entrada("No puedo compartir instrucciones internas. ¿Buscás un traje para algún evento?", { esPrimerMensaje: false }),
  );
  await noSalta(
    presentacionRepetida,
    entrada("Como te contaba, en Mr Otto todo es a medida.", { esPrimerMensaje: false }),
  );
  // Una respuesta directa a "¿cómo te llamás?" no es una autopresentación de vuelta: no
  // menciona a Otto, así que no se corta.
  await noSalta(presentacionRepetida, entrada("Soy Lucía. ¿En qué te puedo ayudar?", { esPrimerMensaje: false }));
});

Deno.test("una_pregunta salta con dos preguntas en un mensaje", async () => {
  await salta(unaPregunta, entrada("¡Hola! ¿Cómo estás? ¿Para qué evento necesitás el traje?"));
});

Deno.test("una_pregunta no salta con una sola pregunta, aunque tenga dos signos de cierre (caso parecido)", async () => {
  await noSalta(unaPregunta, entrada("¿Para qué evento lo necesitás??"));
  await noSalta(unaPregunta, entrada("¡Hola, Juan! Para graduaciones tenemos varios modelos. ¿Qué fecha es la graduación?"));
});

Deno.test("largo salta con un bloque de más de 600 caracteres sin cortes", async () => {
  const r = await salta(largo, entrada("palabra ".repeat(90).trim()));
  assertMatch(r.motivo, /párrafos cortos/);
});

Deno.test("largo no salta con el mismo largo partido en párrafos (caso parecido)", async () => {
  const bloque = "palabra ".repeat(30).trim();
  await noSalta(largo, entrada([bloque, bloque, bloque].join("\n\n")));
});

// ── contenido ────────────────────────────────────────────────────────────────────────────

Deno.test("precio_sin_herramienta salta con $150.000 sin consultar_catalogo en la traza", async () => {
  const r = await salta(precioSinHerramienta, entrada("El alquiler arranca en $150.000 😊"));
  assertMatch(r.motivo, /consultar_catalogo/);
});

Deno.test("precio_sin_herramienta no salta con el mismo texto y la herramienta en la traza, ni con España 764 (caso parecido)", async () => {
  await noSalta(
    precioSinHerramienta,
    entrada("El alquiler arranca en $150.000 😊", { traza: traza({ herramientas: ["consultar_catalogo"], precios: [150000] }) }),
  );
  await noSalta(precioSinHerramienta, entrada("Estamos en España 764, Rosario."));
});

Deno.test("precio_sin_herramienta salta con un total que no devolvió ninguna herramienta (regla 9)", async () => {
  const conPrecios = traza({ herramientas: ["consultar_catalogo", "consultar_accesorios"], precios: [150000, 33500] });
  const r = await salta(precioSinHerramienta, entrada("Con camisa y corbata te queda en $183.500.", { traza: conPrecios }));
  assertMatch(r.motivo, /no se suman/);
});

Deno.test("precio_sin_herramienta reconoce 150 mil y 150000 sin signo", async () => {
  assertEquals(montos("sale 150 mil"), [150000]);
  assertEquals(montos("sale 150000 pesos"), [150000]);
  assertEquals(montos("la camisa y corbata 33,5 mil"), [33500]);
  await noSalta(precioSinHerramienta, entrada("Sale 150 mil.", { traza: traza({ precios: [150000] }) }));
  await salta(precioSinHerramienta, entrada("Sale 150 mil."));
});

Deno.test("precio_sin_herramienta reconoce CUALQUIER monto corto suelto, no solo una lista fija de palabras (hallazgo de Mateo, 16/9)", async () => {
  // La primera versión (16/9, a la mañana) solo miraba sale/cuesta/son/anda en, y se escapaba con
  // cualquier otra forma de decir un precio. Dado vuelta: cualquier número de 2 o 3 cifras es
  // sospechoso, salvo que el contexto lo explique (ver el test de abajo).
  for (
    const frase of [
      "te sale como 150",
      "180 nomás",
      "cuesta 220",
      "anda en 90",
      "te queda en unos 150",
      "te lo dejo en 150",
      "por 150 te llevás el combo",
      "arranca en 150",
      "y bueno, 150 y sale con todo",
      // Tercera vuelta, 16/9: el lookahead descartaba con CUALQUIER puntuación después, incluida
      // la de la oración — esto es casi todo precio que cae al final de una frase.
      "son 150, más el accesorio",
      "son 150. Te sirve?",
      "el traje sale 150.",
    ]
  ) {
    assert(montos(frase).length > 0, `"${frase}" tendría que reconocer un monto`);
  }
  // "sale 150 mil" es un solo monto ($150.000), no dos (150 y 150000).
  assertEquals(montos("sale 150 mil"), [150000]);
  await salta(precioSinHerramienta, entrada("Un traje te sale como 150 😊"));
  await salta(precioSinHerramienta, entrada("Por 150 te llevás el combo completo."));
  // Ojo acá con el punto final pegado al número ("como 150."): tiene que reconocerlo (no vale que
  // "no salta" dé lo mismo por no haber encontrado nada que por haberlo encontrado en la traza).
  assertEquals(montos("Un traje te sale como 150."), [150]);
  await noSalta(precioSinHerramienta, entrada("Un traje te sale como 150.", { traza: traza({ precios: [150] }) }));
});

Deno.test("precio_sin_herramienta no confunde un número con contexto que lo explica (caso parecido)", async () => {
  assertEquals(montos("talle 48"), []);
  assertEquals(montos("Estamos en España 764, Rosario."), []);
  assertEquals(montos("nos vemos a las 15"), []);
  assertEquals(montos("se puede pagar en 3 cuotas"), []);
  assertEquals(montos("somos 44 invitados"), []);
  assertEquals(montos("uso el talle 44"), []);
  assertEquals(montos("tenemos del 44 al 68"), []);
  assertEquals(montos("mide 170"), []);
  assertEquals(montos("medís 180 de altura?"), []);
  assertEquals(montos("170 de altura"), []);
  assertEquals(montos("tengo 44 años"), []);
  assertEquals(montos("es el cumpleaños de 15 de mi hija"), []);
  await noSalta(precioSinHerramienta, entrada("El talle 48 te queda bien."));
  await noSalta(precioSinHerramienta, entrada("¿Medís 180 de altura?"));
  await noSalta(precioSinHerramienta, entrada("Estamos en España 764, Rosario."));
  await noSalta(precioSinHerramienta, entrada("Nos vemos a las 15."));
  await noSalta(precioSinHerramienta, entrada("Se puede pagar en 3 cuotas."));
  await noSalta(precioSinHerramienta, entrada("Somos 44 invitados en el casamiento."));
});

// URGENTE, hallazgo de Mateo/logica en vivo contra el worker desplegado, 16/9: "te agendo el
// martes 23 a las 13" leía el día del mes (23) como precio. Rompía agendar_turno de punta a
// punta — la barandilla no dejaba salir ninguna confirmación, y el cliente se quedaba sin
// turno y sin respuesta.
Deno.test("precio_sin_herramienta no confunde una fecha ni una hora de turno con un precio (hallazgo URGENTE, 16/9)", async () => {
  for (
    const frase of [
      "te agendo el martes 23 a las 13",
      "el 23 de septiembre",
      "tenés turno el 23",
      "queda para el lunes 22 a las 15",
      "el sábado 30 a las 11",
      "te espero el 23/9",
    ]
  ) {
    assertEquals(montos(frase), [], `"${frase}" no tendría que reconocer ningún monto`);
  }
  await noSalta(precioSinHerramienta, entrada("Te agendo el martes 23 a las 13."));
  await noSalta(precioSinHerramienta, entrada("Tenés turno el 23."));
  await noSalta(precioSinHerramienta, entrada("El sábado 30 a las 11 te esperamos."));
  // Caso parecido: un precio real sigue reconociéndose aunque la frase se parezca a una fecha.
  for (
    const frase of [
      "te sale como 150",
      "180 nomás",
      "cuesta 220",
      "anda en 90",
      "te queda en unos 150",
      "te lo dejo en 150",
      "por 150 te llevás el combo",
      "arranca en 150",
      "son 150, más el accesorio",
      "son 150. Te sirve?",
      "el traje sale 150.",
    ]
  ) {
    assert(montos(frase).length > 0, `"${frase}" tendría que seguir reconociendo un monto`);
  }
});

// Hallazgo de la auditoría, 17/9: "se abona el 100%" hacía saltar la barandilla (100 como si
// fuera un precio) y la charla terminaba derivando en silencio con el fragmento que-incluye,
// que habla justo de porcentajes de seña, sembrado.
Deno.test("precio_sin_herramienta no confunde un porcentaje con un precio (hallazgo de la auditoría, 17/9)", async () => {
  for (const frase of ["se abona el 100% al confirmar", "la seña es del 50 por ciento", "dejás el 30% de seña"]) {
    assertEquals(montos(frase), [], `"${frase}" no tendría que reconocer ningún monto`);
  }
  await noSalta(precioSinHerramienta, entrada("Se abona el 100% al confirmar el turno."));
  await noSalta(precioSinHerramienta, entrada("La seña es del 50 por ciento."));
});

Deno.test("horario_sin_herramienta salta con una hora ofrecida sin buscar_horarios", async () => {
  await salta(horarioSinHerramienta, entrada("Tengo lugar el jueves a las 16:15."));
  await salta(horarioSinHerramienta, entrada("Te espero a las 16 hs."));
});

Deno.test("horario_sin_herramienta lee una hora en palabras (hallazgo de Mateo, 16/9)", async () => {
  assertEquals(horas("nos vemos a las tres de la tarde"), ["15:00"]);
  assertEquals(horas("a las diez de la manana"), ["10:00"]);
  assertEquals(horas("a la una de la tarde"), ["13:00"]);
  await salta(horarioSinHerramienta, entrada("Te espero a las tres de la tarde."));
  await noSalta(
    horarioSinHerramienta,
    entrada("Te espero a las tres de la tarde.", { traza: traza({ herramientas: ["buscar_horarios"], horas: ["15:00"] }) }),
  );
});

Deno.test("horario_sin_herramienta no salta con la hora que devolvió buscar_horarios, ni con «¿a la mañana o a la tarde?» (caso parecido)", async () => {
  await noSalta(
    horarioSinHerramienta,
    entrada("Tengo lugar el jueves a las 16:15.", { traza: traza({ herramientas: ["buscar_horarios"], horas: ["16:15"] }) }),
  );
  await noSalta(horarioSinHerramienta, entrada("¿Te queda mejor a la mañana o a la tarde?"));
});

Deno.test("horario_sin_herramienta salta con el horario del local dicho de memoria", async () => {
  await salta(horarioSinHerramienta, entrada("Abrimos de 10 a 19 😊"));
  await noSalta(horarioSinHerramienta, entrada("Abrimos de 10 a 19 😊", { traza: traza({ horas: ["10:00", "19:00"] }) }));
});

Deno.test("horario_sin_herramienta no confunde cantidades con horas (caso parecido)", async () => {
  assertEquals(horas("si vienen de 2 a 3 personas lo coordinamos"), []);
  assertEquals(horas("tenemos talles del 4 al 68"), []);
  await noSalta(horarioSinHerramienta, entrada("Si vienen de 2 a 3 personas, lo coordinamos en el turno."));
});

Deno.test("horario_sin_herramienta salta al ofrecer un día sin buscar_horarios", async () => {
  await salta(horarioSinHerramienta, entrada("Tenemos lugar el sábado."));
  await noSalta(horarioSinHerramienta, entrada("Tenemos lugar el sábado.", { traza: traza({ herramientas: ["buscar_horarios"] }) }));
});

Deno.test("accesorio_sin_herramienta salta al mencionar zapatos, cinturón, corbata o camisa sin la herramienta", async () => {
  await salta(accesorioSinHerramienta, entrada("Sí, también alquilamos zapatos y cinturón para completar el look."));
  await salta(accesorioSinHerramienta, entrada("Podés sumar camisa y corbata al look."));
});

Deno.test("accesorio_sin_herramienta no salta con la herramienta en la traza, ni si no menciona ningún accesorio (caso parecido)", async () => {
  await noSalta(
    accesorioSinHerramienta,
    entrada("Sí, también alquilamos zapatos y cinturón.", { traza: traza({ herramientas: ["consultar_accesorios"] }) }),
  );
  await noSalta(accesorioSinHerramienta, entrada("¿Para qué evento necesitás el traje?"));
});

// ── reglas ───────────────────────────────────────────────────────────────────────────────

Deno.test("deriva_y_pregunta salta con derivar_a_persona y una pregunta, y saca la pregunta", async () => {
  const r = await salta(
    derivaYPregunta,
    entrada("Le paso tu consulta al equipo. ¿Me dejás tu mail?", { traza: traza({ herramientas: ["derivar_a_persona"] }) }),
  );
  assertEquals(r.texto, "Le paso tu consulta al equipo.");
});

Deno.test("deriva_y_pregunta no salta con una pregunta sin derivar, ni con la derivación sin pregunta (caso parecido)", async () => {
  await noSalta(derivaYPregunta, entrada("¿Para qué evento es?"));
  await noSalta(derivaYPregunta, entrada("Le paso tu consulta al equipo.", { traza: traza({ herramientas: ["derivar_a_persona"] }) }));
});

Deno.test("anuncia_sin_derivar salta con «te paso con» sin la herramienta y pide ejecutar la derivación", async () => {
  const r = await salta(anunciaSinDerivar, entrada("Te paso con alguien del equipo. ¿Te parece?"));
  assertEquals(r.texto, "Te paso con alguien del equipo.");
});

Deno.test("anuncia_sin_derivar no salta si derivó de verdad, ni con «el equipo te asesora» (caso parecido)", async () => {
  await noSalta(anunciaSinDerivar, entrada("Te paso con alguien del equipo.", { traza: traza({ herramientas: ["derivar_a_persona"] }) }));
  await noSalta(anunciaSinDerivar, entrada("Para verlo puesto, te reservo un turno y el equipo te asesora con el calce."));
});

Deno.test("no_a_secas salta con una negativa sola", async () => {
  await salta(noASecas, entrada("No, no hacemos envíos."));
  await salta(noASecas, entrada("Lamentablemente no tenemos ese color."));
});

Deno.test("no_a_secas no salta con «no te preocupes» ni con una respuesta que no niega (caso parecido)", async () => {
  await noSalta(noASecas, entrada("No te preocupes, pensalo tranquilo."));
  await noSalta(noASecas, entrada("¡Claro! Tenemos talles del 4 al 68."));
});

// Hasta el 17/9 el caso dudoso (arranca negando pero es largo u ofrece algo) le preguntaba a un
// "revisor" LLM que turno.ts nunca pasaba — la rama no corría nunca en producción (hallazgo de
// la auditoría, 17/9). Se sacó: en el caso dudoso, no salta (mejor un falso negativo ocasional
// que frenar un mensaje que sí ofrece algo).
Deno.test("no_a_secas no salta en el caso dudoso: arranca negando pero ofrece algo (caso parecido)", async () => {
  const dudoso = "No hacemos envíos a otras ciudades, pero te lo dejamos listo en el local de España 764 para que lo retires.";
  await noSalta(noASecas, entrada(dudoso));
});

Deno.test("menciona_ia salta cuando cuenta cómo funciona por dentro", async () => {
  await salta(mencionaIa, entrada("Eso no lo tengo cargado en el sistema."));
  await salta(mencionaIa, entrada("Soy una IA que ayuda a Mr Otto."));
});

Deno.test("menciona_ia salta con una IA en tercera persona junto a una palabra de meta-funcionamiento (hallazgo M3, sin frase exacta)", async () => {
  await salta(mencionaIa, entrada("Puedo ayudarte con un resumen general sobre cómo una IA sigue instrucciones, protege información interna y responde de forma segura."));
  await salta(mencionaIa, entrada("Las reglas de configuración que sigue una IA no se comparten."));
});

Deno.test("menciona_ia no salta con modelos de traje, con la presentación, ni con \"ia\" dentro de otra palabra (caso parecido)", async () => {
  await noSalta(mencionaIa, entrada("Tenemos varios modelos de traje para graduación."));
  await noSalta(mencionaIa, entrada("Hola, soy Lucía, asistente de Mr Otto. ¿En qué puedo ayudarte hoy?"));
  await noSalta(mencionaIa, entrada("Con gusto te guío para elegir el traje del día de tu graduación."));
});

Deno.test("fuera_ventana_meta bloquea el texto libre pasadas las 24 hs, o si el cliente nunca escribió", async () => {
  await salta(fueraVentanaMeta, entrada("¿Seguís interesado?", { ultimoMensajeClienteAt: new Date(AHORA.getTime() - 24 * HORA_MS - 60000) }));
  await salta(fueraVentanaMeta, entrada("Hola", { ultimoMensajeClienteAt: null }));
});

Deno.test("fuera_ventana_meta no bloquea a las 23 hs del último mensaje (caso parecido)", async () => {
  await noSalta(fueraVentanaMeta, entrada("¿Seguís interesado?", { ultimoMensajeClienteAt: new Date(AHORA.getTime() - 23 * HORA_MS) }));
});
