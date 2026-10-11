// El auditor de promesas (trabajo 4, pedido de Mateo, 10/10): lo que Lucía dice que hizo tiene que haber
// pasado de verdad. Cada promesa sin hacer salta, con la herramienta no salta, lo que ya era verdad en
// la base no salta, y en el segundo intento se saca la oración y sale el resto. Los textos «reales»
// son mensajes de Lucía de las charlas del 29/9 al 10/10 (ver la calibración en promesa_sin_hacer.ts).

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { aplicarBarandillas } from "../../supabase/functions/_shared/barandillas/index.ts";
import { promesaSinHacer } from "../../supabase/functions/_shared/barandillas/chequeos/promesa_sin_hacer.ts";
import type { EntradaBarandilla } from "../../supabase/functions/_shared/barandillas/tipos.ts";
import type { Traza, TurnoDelCliente } from "../../supabase/functions/_shared/traza.ts";
import { entrada, traza } from "./_ayuda.ts";

// El turno de Walter (10/10): martes 13 de octubre a las 13:00, agendado y sin confirmar.
const MARTES_13: TurnoDelCliente = {
  id: "turno-walter", fecha: "2026-10-13", hora: "13:00", diaSemana: 2, dia: 13, enDias: 3, estado: "sin-confirmar", confirmado: false,
};
const CONFIRMADO = { ...MARTES_13, estado: "confirmado", confirmado: true };
const MIERCOLES_14: TurnoDelCliente = {
  id: "turno-tomas", fecha: "2026-10-14", hora: "16:30", diaSemana: 3, dia: 14, enDias: 4, estado: "sin-confirmar", confirmado: false,
};

const con = (t: Traza, extra: Partial<Traza>) => Object.assign(t, extra);
const evaluar = (texto: string, extra: Partial<EntradaBarandilla> = {}) => promesaSinHacer.evaluar(entrada(texto, extra));
const salta = async (texto: string, extra: Partial<EntradaBarandilla> = {}) => (await evaluar(texto, extra)).salta;

const WALTER = "Perfecto, Walter, queda confirmado tu turno del martes 13 a las 13:00.";

Deno.test("«queda confirmado» sin cambiar_turno: se rehace diciéndole qué llamar (Walter, 10/10)", async () => {
  const r = await evaluar(WALTER, { traza: con(traza(), { turnosCliente: [MARTES_13] }), mensajeCliente: "Y\nGracias.  Ya confirme para las 13" });
  assert(r.salta);
  assertEquals(r.accion, "rehacer");
  assertMatch(r.motivo, /dijiste que el turno quedó confirmado .*no llamaste a cambiar_turno con accion confirmar/);
  assertMatch(r.motivo, /queda confirmado tu turno del martes 13/);
  // Con la herramienta en el turno, la promesa está cumplida.
  assertEquals(await salta(WALTER, { traza: con(traza({ herramientas: ["cambiar_turno:confirmar"] }), { turnosCliente: [MARTES_13] }) }), false);
});

Deno.test("las respuestas al recordatorio que quedaron sin confirmar en el panel (8/10 y 9/10) también saltan", async () => {
  const romina: TurnoDelCliente = { ...MARTES_13, fecha: "2026-10-09", hora: "10:45", diaSemana: 5, dia: 9, enDias: 1 };
  const agustina: TurnoDelCliente = { ...MARTES_13, fecha: "2026-10-10", hora: "11:45", diaSemana: 6, dia: 10, enDias: 1 };
  assert(await salta("Hola, Romina! Perfecto, queda confirmado el turno del viernes 9 a las 10:45. Te esperamos.", {
    traza: con(traza(), { turnosCliente: [romina] }),
  }));
  assert(await salta("Perfecto, Agustina, queda confirmado el turno de mañana, sábado 10 de octubre a las 11:45. Los esperamos en España 764.", {
    traza: con(traza(), { turnosCliente: [agustina] }),
  }));
});

// Una por familia: sin la herramienta salta (y dice cuál faltó); con la herramienta, no.
const FAMILIAS: { caso: string; texto: string; herramienta: string; falta: RegExp }[] = [
  { caso: "agendar", texto: "Listo, te agendé el jueves 15 a las 16:00.", herramienta: "agendar_turno", falta: /agendar_turno/ },
  { caso: "agendar (resultado)", texto: "Tu turno quedó reservado para el jueves 15 a las 16:00.", herramienta: "agendar_turno", falta: /agendar_turno/ },
  { caso: "confirmar", texto: "Ya confirmé tu turno del martes.", herramienta: "cambiar_turno:confirmar", falta: /accion confirmar/ },
  { caso: "mover", texto: "Listo, te pasé el turno al jueves 15 a las 16:00.", herramienta: "cambiar_turno:mover", falta: /accion mover/ },
  { caso: "mover sin decir a cuándo", texto: "Listo, ya te lo reprogramé.", herramienta: "cambiar_turno:mover", falta: /accion mover/ },
  { caso: "cancelar", texto: "Listo, Mauri, el turno del martes 13 quedó cancelado.", herramienta: "cambiar_turno:cancelar", falta: /accion cancelar/ },
  { caso: "cancelar (primera persona)", texto: "No te preocupes, ya cancelé el turno.", herramienta: "cambiar_turno:cancelar", falta: /accion cancelar/ },
  { caso: "link, presente (5/10)", texto: "Para ver los diseños disponibles, te envío el catálogo online.", herramienta: "enviar_link:web", falta: /enviar_link con tipo web/ },
  { caso: "link, pasado", texto: "Te mandé el catálogo online para que mires opciones.", herramienta: "enviar_link:web", falta: /enviar_link con tipo web/ },
  { caso: "link de venta", texto: "Te comparto la web de venta para que veas los trajes.", herramienta: "enviar_link:web-venta", falta: /enviar_link/ },
  { caso: "mapa", texto: "Te paso la ubicación para que llegues sin vueltas.", herramienta: "enviar_link:mapa", falta: /enviar_link con tipo mapa/ },
  { caso: "link genérico", texto: "Te dejo el link para que lo tengas a mano.", herramienta: "enviar_link:web", falta: /enviar_link/ },
  { caso: "datos (mail)", texto: "Perfecto, anoté tu mail.", herramienta: "guardar_datos_cliente", falta: /guardar_datos_cliente/ },
  { caso: "datos (nota)", texto: "Queda anotado que venís con tu sobrino Nicolás.", herramienta: "guardar_datos_cliente", falta: /guardar_datos_cliente/ },
];

for (const f of FAMILIAS) {
  Deno.test(`promesa sin hacer (${f.caso}): salta sin la herramienta y no con ella`, async () => {
    const r = await evaluar(f.texto, { traza: con(traza(), { turnosCliente: [MARTES_13] }) });
    assert(r.salta, f.texto);
    assertEquals(r.accion, "rehacer");
    assertMatch(r.motivo, f.falta);
    const hecha = con(traza({ herramientas: [f.herramienta] }), { turnosCliente: [MARTES_13] });
    assertEquals(await salta(f.texto, { traza: hecha }), false, `con ${f.herramienta}: ${f.texto}`);
  });
}

Deno.test("«te paso fotos» salta y le dice que no manda fotos, que mande el catálogo (1/10: la clienta las volvió a pedir al otro día)", async () => {
  const texto = "Para completar el look, también alquilamos camisa y corbata por $33.500, y zapatos con cinturón por $55.000. " +
    "Se pueden combinar según el modelo que elijas; te paso fotos de los conjuntos disponibles para que los veas.";
  const r = await evaluar(texto);
  assert(r.salta);
  assertMatch(r.motivo, /no mandás fotos.*enviar_link \(tipo web\)/);
  assertEquals(await salta(texto, { traza: traza({ herramientas: ["enviar_link:web"] }) }), false);
});

Deno.test("una pregunta al final no salva la promesa de antes; la pregunta sola no promete nada", async () => {
  assert(await salta("Te paso el catálogo online, ¿te parece?"));
  assertEquals(await salta("¿Querés que te pase el catálogo online?"), false);
  assertEquals(await salta("Querés que te reserve un turno para venir a probarte?"), false);
});

Deno.test("«quedó para el jueves a las 15» sin decir qué es un turno; sin hora es la fecha del evento (30/9)", async () => {
  assert(await salta("Listo, quedó para el jueves a las 15."));
  assertEquals(await salta("Perfecto, queda para el 19 de diciembre de 2026."), false);
  assertEquals(await salta("Perfecto, la graduación quedó para el viernes 11 a las 21."), false);
});

Deno.test("el participio solo, como respuesta («¡Confirmado!», «Listo, agendado»), también dice que está hecho", async () => {
  assert(await salta("¡Confirmado, Walter! Te esperamos.", { traza: con(traza(), { turnosCliente: [MARTES_13] }) }));
  assert(await salta("¡Listo! Agendado para el jueves 15 a las 16:00."));
  assert(await salta("Listo, cancelado.", { traza: con(traza(), { turnosCliente: [MARTES_13] }) }));
  // «Queda confirmado que…» confirma un dato, no el turno.
  assertEquals(await salta("Sí, queda confirmado que pueden venir los dos al mismo turno."), false);
});

Deno.test("lo que contó el cliente no es una promesa; lo que Lucía hizo por lo que contó, sí", async () => {
  assertEquals(await salta("Me dijiste que el turno quedó cancelado por la lluvia, ¿querés otro día?"), false);
  assert(await salta("Como me dijiste que preferís la tarde, te agendé el jueves 15 a las 16:00."));
});

Deno.test("«te lo paso por acá»: es un link si la oración o el pedido del cliente nombran uno", async () => {
  assert(await salta("Te lo paso por acá.", { mensajeCliente: "Bueno dale, pasame el catalogo" }));
  assertEquals(await salta("Te lo paso por acá.", { mensajeCliente: "Bueno dale, pasame el catalogo", traza: traza({ herramientas: ["enviar_link:web"] }) }), false);
  assertEquals(await salta("Te lo paso por acá.", { mensajeCliente: "pasame tu horario" }), false);
});

// Lo que ya era verdad en la base al empezar el turno no se frena (turno.ts siembra la traza).
Deno.test("turno ya confirmado: «queda confirmado» es verdad sin llamar a nada", async () => {
  assertEquals(await salta(WALTER, { traza: con(traza(), { turnosCliente: [CONFIRMADO] }) }), false);
  assertEquals(await salta("Sí, tu turno del martes ya está confirmado. Te esperamos.", { traza: con(traza(), { turnosCliente: [CONFIRMADO] }) }), false);
  // Caso parecido: el confirmado es OTRO turno (otro día y hora), el del martes 13 sigue sin confirmar.
  const otro = { ...CONFIRMADO, id: "otro", fecha: "2026-10-20", diaSemana: 2, dia: 20, hora: "10:00" };
  assert(await salta(WALTER, { traza: con(traza(), { turnosCliente: [MARTES_13, otro] }) }));
  // Y sin ningún turno, no hay nada que pueda estar confirmado.
  assert(await salta("Perfecto, queda confirmado.", { traza: con(traza(), { turnosCliente: [] }) }));
});

Deno.test("turno que ya tiene: «quedó reservado» o «ya tenés turno» es verdad; sin ese turno, no", async () => {
  const conTomas = { traza: con(traza(), { turnosCliente: [MIERCOLES_14] }) };
  assertEquals(await salta("Sí, tu turno del miércoles a las 16:30 ya quedó reservado.", conTomas), false);
  assertEquals(await salta("Sí, ya tenés turno para el miércoles 14 a las 16:30.", conTomas), false);
  assert(await salta("Sí, ya tenés turno para el jueves 15 a las 16:30.", conTomas)); // a esa hora no tiene ninguno
  assert(await salta("Sí, tu turno del miércoles a las 16:30 ya quedó reservado."));
});

Deno.test("turno ya cancelado (ya no figura entre sus turnos activos): «quedó cancelado» es verdad", async () => {
  assertEquals(await salta("Sí, el turno del martes 13 quedó cancelado.", { traza: con(traza(), { turnosCliente: [MIERCOLES_14] }) }), false);
  assertEquals(await salta("Sí, ya quedó cancelado.", { traza: con(traza(), { turnosCliente: [] }) }), false);
  assert(await salta("Sí, el turno del martes 13 quedó cancelado.", { traza: con(traza(), { turnosCliente: [MARTES_13] }) }));
});

Deno.test("turno ya movido: «te lo pasé al miércoles a las 16:30» es verdad si ya está ahí", async () => {
  assertEquals(await salta("Sí, te lo pasé al miércoles 14 a las 16:30.", { traza: con(traza(), { turnosCliente: [MIERCOLES_14] }) }), false);
  assert(await salta("Sí, te lo pasé al miércoles 14 a las 16:30.", { traza: con(traza(), { turnosCliente: [MARTES_13] }) }));
});

Deno.test("un link que ya le llegó antes en la charla, nombrado en pasado, no salta; en presente se espera ahora", async () => {
  const conLink = { traza: con(traza(), { linksPrevios: ["web"] }) };
  assertEquals(await salta("Para ver los modelos, podés consultar el catálogo que te envié.", conLink), false);
  assertEquals(await salta("Te mandé el catálogo online hace un rato.", conLink), false);
  assert(await salta("Para ver los modelos, podés consultar el catálogo que te envié.")); // nunca le llegó
  assert(await salta("Te paso el catálogo online para que veas los modelos.", conLink)); // «te paso» es ahora
  // El mapa no es el catálogo.
  assert(await salta("Te mandé la ubicación hace un rato.", conLink));
});

Deno.test("un dato que la ficha ya tenía no salta; una nota nueva sin guardar_datos_cliente, sí", async () => {
  const conMail = { traza: con(traza(), { datosConocidos: ["email", "nombre"] }) };
  assertEquals(await salta("Sí, ya anoté tu mail.", conMail), false);
  assertEquals(await salta("Perfecto, anoté tu número.", conMail), false); // el de WhatsApp siempre lo tenemos
  assert(await salta("Perfecto, anoté que venís con tu hijo.", conMail));
  assert(await salta("Listo, guardé la fecha: 7 de diciembre.", conMail));
  // agendar_turno también escribe la ficha (nombre, evento, fecha).
  assertEquals(await salta("Listo, guardé tu nombre.", { traza: traza({ herramientas: ["agendar_turno"] }) }), false);
});

// Lo que NO es una promesa sin hacer, con la traza vacía (sin herramientas, sin turnos, sin datos).
const NO_SON_PROMESAS = [
  // Ofrecimientos y condiciones (6/10: «Si querés ver los modelos, te paso el catálogo online»).
  "Perfecto, Jere! Si querés ver los modelos, te paso el catálogo online; la disponibilidad depende del talle.",
  "La compra se hace en persona, sin turno; si te interesa comprar, te paso la web para ver algunos modelos.",
  "Cuando definan el día, lo reservamos para ustedes.",
  "Si te sirve, puedo reservarte el lunes 12 a las 14:00.",
  // Preguntas.
  "¿Querés que te reserve un turno para venir a probarte?",
  "Querés que te pase la dirección del local?",
  // Negaciones.
  "Todavía no quedó confirmado: 24 horas antes te llega un recordatorio para confirmarlo.",
  "Para hoy no puedo reservarte un turno con la anticipación necesaria.",
  // Lo hace otro, o es cómo funciona.
  "Eso te lo confirma el equipo del local.",
  "El talle exacto se confirma en la prueba, con los ajustes de sastrería.",
  "El traje queda reservado cuando abonás el 100% en el local.",
  "Lo ideal es reservar entre 60 y 7 días antes del evento.",
  "Uh, qué pena que quedó cancelado el casamiento.",
  // Los textos fijos (texto_derivacion_fallo: «confirme» sin tilde no es «confirmé»).
  "¡Claro! 😊 Prefiero que esta consulta te la confirme alguien del equipo, para no darte un dato incorrecto. Ya les avisé: en un rato te escriben por acá.",
  "¡Gracias por confirmar! Te esperamos en el local.",
  // El pase a una persona es de anuncia_sin_derivar, no de este chequeo.
  "Te paso con alguien del equipo para que te ayude con esto. En un rato te escriben.",
  // Cosas que se «mandan» y no son links.
  "Gracias a vos por compartirlo conmigo, Miriam. Te mando un abrazo grande.",
  "La dirección es España 764, Rosario.",
  "No tengo confirmado si compramos vestidos de novia; te paso con el equipo para que te lo aclaren.",
  "Perfecto, queda confirmado el color azul para la prueba.",
];

for (const texto of NO_SON_PROMESAS) {
  Deno.test(`no es una promesa sin hacer: «${texto.slice(0, 60)}»`, async () => {
    assertEquals(await salta(texto), false, texto);
  });
}

// Segundo intento (D13, como los montos de precio_sin_herramienta): se saca la oración de la promesa y
// sale el resto, con el registro para la Bitácora.
Deno.test("segundo intento: se saca la oración de la promesa, sale el resto y queda el registro para la Bitácora", async () => {
  const agustina: TurnoDelCliente = { ...MARTES_13, fecha: "2026-10-10", hora: "11:45", diaSemana: 6, dia: 10, enDias: 1 };
  const texto = "Perfecto, Agustina, queda confirmado el turno de mañana, sábado 10 de octubre a las 11:45. Los esperamos en España 764.";
  const r = await evaluar(texto, { traza: con(traza(), { turnosCliente: [agustina] }), saltosPrevios: 1 });
  assert(r.salta);
  assertEquals(r.accion, "cortar");
  assertEquals(r.texto, "Los esperamos en España 764.");
  assertMatch(r.motivo, /segundo intento: se sacó en código la oración/);
  assertEquals(r.registro?.etapa, "auditor_promesas");
  assertEquals(r.registro?.promesa, "Perfecto, Agustina, queda confirmado el turno de mañana, sábado 10 de octubre a las 11:45.");
  assertEquals(r.registro?.falto, "cambiar_turno con accion confirmar");
  assertEquals(r.registro?.tipos, ["confirmar"]);
  assertMatch(String(r.registro?.resumen), /^Auditor de promesas: /);
});

Deno.test("segundo intento: si la promesa es solo una parte entre «;», queda la otra parte", async () => {
  const texto = "Se pueden combinar según el modelo que elijas; te paso fotos de los conjuntos disponibles para que los veas.";
  const r = await evaluar(texto, { saltosPrevios: 1 });
  assertEquals(r.salta && r.texto, "Se pueden combinar según el modelo que elijas.");
  const alReves = await evaluar("Te mandé el catálogo online; la disponibilidad depende del talle y de la fecha.", { saltosPrevios: 1 });
  assertEquals(alReves.salta && alReves.texto, "La disponibilidad depende del talle y de la fecha.");
});

Deno.test("segundo intento: los párrafos que quedan se respetan", async () => {
  const texto = "El alquiler incluye el ambo, la sastrería y la tintorería.\n\nTe envío el catálogo online para que veas los modelos.\n\nPara qué fecha es el evento?";
  const r = await evaluar(texto, { saltosPrevios: 1 });
  assertEquals(r.salta && r.texto, "El alquiler incluye el ambo, la sastrería y la tintorería.\n\nPara qué fecha es el evento?");
});

// Por el camino completo (index.ts): el primer intento se rehace con la instrucción; el segundo sale
// sin la promesa, sin derivar; y si no queda nada, recién ahí barandilla_doble.
Deno.test("aplicarBarandillas: el primer intento se rehace con la instrucción, en el control pase_coherente", async () => {
  // La hora del turno la siembra turno.ts en horasDevueltas (contexto.horas): no es un horario inventado.
  const r = await aplicarBarandillas(entrada(WALTER, { traza: con(traza(), { turnosCliente: [MARTES_13], horasDevueltas: ["13:00"] }) }));
  assertEquals(r.decision, "rehacer");
  assertMatch(r.instruccion ?? "", /cambiar_turno con accion confirmar: si el cliente lo confirma, llamala/);
  assertEquals(r.saltos.map((s) => [s.barandilla, s.chequeo, s.accion]), [["pase_coherente", "promesa_sin_hacer", "rehacer"]]);
});

Deno.test("aplicarBarandillas: el segundo intento sale sin la promesa y el salto lleva el registro", async () => {
  const texto = "Hola, Romina! Perfecto, queda confirmado el turno del viernes 9 a las 10:45. Te esperamos el viernes.";
  const romina: TurnoDelCliente = { ...MARTES_13, fecha: "2026-10-09", hora: "10:45", diaSemana: 5, dia: 9, enDias: 1 };
  const r = await aplicarBarandillas(entrada(texto, { traza: con(traza(), { turnosCliente: [romina], horasDevueltas: ["10:45"] }) }), { saltosPrevios: 1 });
  assertEquals(r.decision, "enviar");
  assertEquals(r.texto, "Hola, Romina! Te esperamos el viernes.");
  const s = r.saltos.find((x) => x.chequeo === "promesa_sin_hacer");
  assertEquals(s?.registro?.etapa, "auditor_promesas");
  assertEquals(s?.registro?.falto, "cambiar_turno con accion confirmar");
});

Deno.test("aplicarBarandillas: si el mensaje era solo la promesa, a la segunda termina en barandilla_doble (como D13)", async () => {
  const r = await aplicarBarandillas(entrada(WALTER, { traza: con(traza(), { turnosCliente: [MARTES_13], horasDevueltas: ["13:00"] }) }), { saltosPrevios: 1 });
  assertEquals(r.texto, "");
  assertEquals(r.decision, "derivar");
  assertEquals(r.motivoDerivacion, "barandilla_doble");
});

Deno.test("con la herramienta, la confirmación repetida la recorta confirmacion_doble y el auditor no dice nada", async () => {
  const t = con(traza({ herramientas: ["cambiar_turno:confirmar"] }), { turnosCliente: [MARTES_13], horasDevueltas: ["13:00"] });
  const r = await aplicarBarandillas(entrada(WALTER, { traza: t }));
  assertEquals(r.decision, "enviar");
  assertEquals(r.saltos.map((s) => s.chequeo), ["confirmacion_doble"]);
});
