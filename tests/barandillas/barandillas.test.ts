// Control 1 del hito 1.5: cada una de las 11 barandillas tiene al menos un test que la dispara
// y otro, con el caso parecido, que NO la dispara. Cuando salta, se verifica también la acción
// de su fila en AGENTE.md § 6 y que deje un motivo para la bitácora.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { accesorioSinHerramienta } from "../../supabase/functions/_shared/barandillas/accesorio_sin_herramienta.ts";
import { anunciaSinDerivar } from "../../supabase/functions/_shared/barandillas/anuncia_sin_derivar.ts";
import { derivaYPregunta } from "../../supabase/functions/_shared/barandillas/deriva_y_pregunta.ts";
import { fueraVentanaMeta } from "../../supabase/functions/_shared/barandillas/fuera_ventana_meta.ts";
import { horarioSinHerramienta, horas } from "../../supabase/functions/_shared/barandillas/horario_sin_herramienta.ts";
import { largo } from "../../supabase/functions/_shared/barandillas/largo.ts";
import { mencionaIa } from "../../supabase/functions/_shared/barandillas/menciona_ia.ts";
import { noASecas } from "../../supabase/functions/_shared/barandillas/no_a_secas.ts";
import { montos, precioSinHerramienta } from "../../supabase/functions/_shared/barandillas/precio_sin_herramienta.ts";
import { sinMarkdown } from "../../supabase/functions/_shared/barandillas/sin_markdown.ts";
import { sinRelleno } from "../../supabase/functions/_shared/barandillas/sin_relleno.ts";
import type { Barandilla, EntradaBarandilla, ResultadoBarandilla } from "../../supabase/functions/_shared/barandillas/tipos.ts";
import { unaPregunta } from "../../supabase/functions/_shared/barandillas/una_pregunta.ts";
import { AHORA, entrada, HORA_MS, revisorDoble, traza } from "./_ayuda.ts";

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

Deno.test("horario_sin_herramienta salta con una hora ofrecida sin buscar_horarios", async () => {
  await salta(horarioSinHerramienta, entrada("Tengo lugar el jueves a las 16:15."));
  await salta(horarioSinHerramienta, entrada("Te espero a las 16 hs."));
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

Deno.test("no_a_secas salta con una negativa sola, sin preguntarle al revisor", async () => {
  const revisor = revisorDoble({ ok: true, motivo: "" });
  await salta(noASecas, entrada("No, no hacemos envíos.", { revisor }));
  await salta(noASecas, entrada("Lamentablemente no tenemos ese color.", { revisor }));
  assertEquals(revisor.llamadas, 0);
});

Deno.test("no_a_secas no salta con «no te preocupes» ni con una respuesta que no niega (caso parecido)", async () => {
  const revisor = revisorDoble({ ok: false, motivo: "no debería llamarse" });
  await noSalta(noASecas, entrada("No te preocupes, pensalo tranquilo.", { revisor }));
  await noSalta(noASecas, entrada("¡Claro! Tenemos talles del 4 al 68.", { revisor }));
  assertEquals(revisor.llamadas, 0);
});

Deno.test("no_a_secas le pregunta al revisor solo en el caso dudoso", async () => {
  const dudoso = "No hacemos envíos a otras ciudades, pero te lo dejamos listo en el local de España 764 para que lo retires.";
  const aprueba = revisorDoble({ ok: true, motivo: "ofrece retirarlo en el local" });
  await noSalta(noASecas, entrada(dudoso, { revisor: aprueba }));
  assertEquals(aprueba.llamadas, 1);
  const rechaza = revisorDoble({ ok: false, motivo: "no ofrece nada concreto" });
  const r = await salta(noASecas, entrada(dudoso, { revisor: rechaza }));
  assertMatch(r.motivo, /revisor/);
  await noSalta(noASecas, entrada(dudoso)); // sin revisor, en la duda no salta
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
