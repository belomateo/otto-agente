// promesa_sin_hacer (reglas) — el auditor de promesas (trabajo 4, pedido de Mateo, 10/10). Antes de
// que salga un mensaje, lo que Lucía dice que HIZO tiene que haber pasado de verdad: «queda
// confirmado» sin cambiar_turno (confirmar), «te agendé» sin agendar_turno, «te paso el catálogo» sin
// enviar_link. Si no, el cliente se queda con algo que nadie hizo y el panel dice otra cosa
// (principio 9: la verdad es lo que quedó en la base).
//
// Caso real (10/10, Walter): ya tenía agendado el martes 13 a las 13:00; escribió «Gracias. Ya
// confirmé para las 13» y Lucía contestó «Perfecto, Walter, queda confirmado tu turno del martes 13 a
// las 13:00» sin llamar a ninguna herramienta: el turno siguió «sin confirmar» en el panel.
//
// Calibrado con los 1782 mensajes de Lucía del 29/9 al 10/10 (todo lo que hay en la base de las
// charlas reales; cada mensaje cruzado con las herramientas de SU turno en eventos_agente): 6 promesas
// sin hacer y ningún falso positivo. Tres «queda confirmado» sin confirmar (Walter, y dos respuestas al
// recordatorio de 24 hs —«Hola genial. Mañana va», «Hola! Perfecto 👌»— que siguieron sin confirmar en
// el panel; a una la confirmó el local a mano media hora antes del turno). Dos «te paso / te envío el
// catálogo online» sin enviar_link: los dos clientes se quedaron sin el link. Y un «te paso fotos de
// los conjuntos» que la clienta tuvo que volver a pedir al otro día. Agendar, mover, cancelar y anotar
// datos no fallaron ni una vez (el modelo llama esas herramientas cuando lo dice: 47, 2, 5 y 40
// promesas, todas hechas), pero se cubren igual: el día que fallen es lo más caro.
//
// Qué NO es una promesa sin hacer (cada uno tiene su prueba del caso parecido):
//  · lo que ya es verdad en la base sin llamar a nada: «tu turno del martes ya está confirmado» si ya
//    lo estaba, «tu turno del miércoles a las 16:30 ya quedó reservado» si lo tiene, «anoté tu mail»
//    si la ficha ya lo tenía (turno.ts siembra traza.turnosCliente con SUS TURNOS del contexto y
//    traza.datosConocidos con la ficha);
//  · un ofrecimiento, una pregunta o una condición: «si querés, te paso el catálogo», «¿querés que te
//    reserve?», «cuando definan el día lo reservamos» (caso real del 6/10: «Si querés ver los modelos,
//    te paso el catálogo online», y el link salió en el turno siguiente, cuando dijo que sí);
//  · una negación: «todavía no quedó confirmado»;
//  · lo que hace otro: «eso te lo confirma el equipo», «el talle se confirma en la prueba», «que te la
//    confirme alguien del equipo» (el texto fijo de barandilla_doble: «confirme» sin tilde no es
//    «confirmé»; por eso los verbos se leen CON tildes);
//  · el link que ya le llegó antes en la charla cuando lo nombra en pasado («el catálogo que te
//    envié», traza.linksPrevios). En presente («te paso el catálogo») se espera el link ahora;
//  · el pase a una persona («ya les avisé», «te paso con el equipo»): eso es anuncia_sin_derivar, en
//    el mismo control.
//
// Qué hace: la primera vez, rehacer, diciéndole al modelo exactamente qué falta («dijiste que el turno
// quedó confirmado pero no llamaste a cambiar_turno con accion confirmar: …»). Si el segundo intento
// vuelve a prometer sin hacer, se saca en código la oración de la promesa (o solo su parte entre «;»)
// y sale el resto, igual que los montos de precio_sin_herramienta (D13); el salto queda en la
// bitácora con etapa auditor_promesas, la promesa y lo que faltó. Solo si no queda nada termina en
// barandilla_doble, como cualquier corte que vacía el mensaje (index.ts).

import { TIPOS_LINK } from "../../enums.ts";
import type { Traza, TurnoDelCliente } from "../../traza.ts";
import { normalizar } from "../texto.ts";
import { type Barandilla, type EntradaBarandilla, NO_SALTA } from "../tipos.ts";
import { horas } from "./horario_sin_herramienta.ts";

export type Familia = "agendar" | "confirmar" | "mover" | "cancelar" | "link" | "datos";
type Cosa = "catalogo" | "mapa" | "resena" | "link" | "fotos";
// frase: la parte del mensaje que promete (lo que se cita y, en el segundo intento, se saca);
// afirmacion: esa misma parte sin la pregunta del final, que es lo que se compara con la base.
export type Promesa = { familia: Familia; frase: string; afirmacion: string; cosa?: Cosa; pasado?: boolean; campos?: string[] };

// El \b de JavaScript no sabe de tildes: en «confirmé» la «é» no cuenta como letra y un \b al final no
// engancha nunca. Los patrones de acá se escriben con \b y se arman con un límite que sí las entiende.
const LETRA = String.raw`[\p{L}\p{N}]`;
const LIMITE = String.raw`(?:(?<=${LETRA})(?!${LETRA})|(?<!${LETRA})(?=${LETRA}))`;
const patron = (fuente: string, flags = "") => new RegExp(fuente.replaceAll(String.raw`\b`, LIMITE), `u${flags}`);

// En minúscula pero CON tildes: «confirmé» (lo hizo) no es «confirme» («que te la confirme alguien del
// equipo»), «reservé» no es «reserve» («¿querés que te reserve?») y «sí» no es «si».
const minuscula = (t: string) => t.normalize("NFC").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();

const QUEDA = String.raw`(?:queda|quedó|quedan|quedaron|está|están)(?: ya| bien| todo)?`;
const CLITICO = String.raw`(?:te|le|les|lo|la|los|las|te lo|te la|se lo|se la)`;
const DE_TURNO = patron(String.raw`\b(?:turnos?|reservas?|visitas?|citas?|horarios?)\b`);
// «El traje queda reservado con el pago», «el alquiler quedó cancelado»: no es un turno.
const DE_TRAJE = patron(String.raw`\b(?:trajes?|ambos?|sacos?|prendas?|alquiler|smoking)\b`);

// Ofrecimientos y condiciones: lo que pasa SI el cliente quiere no es algo hecho («si querés ver los
// modelos, te paso el catálogo»: la condición puede estar antes de la coma).
const CONDICION = patron(String.raw`\b(?:si|cuando|apenas|en cuanto|una vez que|ni bien)\b`);
// Lo que contó el cliente («me dijiste que el turno quedó cancelado») no es algo que hizo Lucía. Solo
// en el mismo tramo: «como me dijiste que preferís la tarde, te agendé el martes» sí es una promesa.
const LO_DIJO_OTRO = patron(String.raw`\b(?:dijiste|contaste|comentaste|dijo|contó|comentó) que\b`);
// Después de la promesa: «queda confirmada cuando abonás el 100%» es cómo funciona, no algo hecho.
const CONDICION_DESPUES = patron(String.raw`\b(?:cuando|una vez que|apenas|en cuanto|con el pago|al abonar|al pagar)\b`);
// «no», «nunca», «tampoco» o «ni» hasta dos palabras antes, sin una coma en el medio.
const NEGACION = /(?:^|\s)(?:no|nunca|tampoco|ni)(?: \S+){0,2} ?$/u;

// «¡Confirmado!», «Listo, agendado»: el participio solo, como respuesta, también dice que está hecho.
const LISTO = String.raw`(?:^[¡!]*|\b(?:listo|perfecto|genial|dale|excelente|buenísimo),? )`;

const AGENDAR = [
  patron(String.raw`\b(?:${CLITICO} )?(?:agendé|reservé)\b`, "g"), // «te agendé», «te lo reservé», «reservé tu turno»
  patron(String.raw`\banoté (?:el|tu|su) turno\b`, "g"),
  patron(String.raw`\b${QUEDA} (?:agendad|reservad)[oa]s?\b`, "g"), // «quedó agendado», «ya está reservado»
  patron(String.raw`${LISTO}(?:agendad|reservad)[oa]\b`, "g"),
  patron(String.raw`\bya tenés (?:tu |el |un )?turno\b`, "g"),
];
// Estos son una reserva solo si la oración dice cuándo («te anoto el martes a las 13»); sin día ni
// hora pueden ser otra cosa (anotar un dato).
const AGENDAR_CON_CUANDO = [
  patron(String.raw`\b(?:te|le|lo|la) (?:agendo|reservo|anoto)\b`, "g"),
  patron(String.raw`\b(?:te|le|les|te lo|se lo) anoté (?:para|el|la|en|a las)\b(?! (?:mail|correo|nombre|fecha|evento|dato))`, "g"),
  patron(String.raw`\bturno (?:ya )?(?:queda|quedó) (?:para|el|a las)\b`, "g"), // «tu turno quedó para el jueves a las 15»
];
// «Listo, quedó para el jueves a las 15», sin decir qué: es un turno solo si dice la HORA. Sin hora es la
// fecha del evento (caso real del 30/9: «Perfecto, queda para el 19 de diciembre de 2026», anotando la
// graduación con guardar_datos_cliente).
const AGENDAR_CON_HORA = [
  patron(String.raw`\b(?:listo|perfecto|genial|dale|buenísimo),? (?:ya )?(?:te )?(?:queda|quedó) (?:para|el|a las)\b`, "g"),
];
const CONFIRMAR = [
  patron(String.raw`\b${QUEDA} confirmad[oa]s?\b`, "g"), // «queda confirmado tu turno» (Walter, 10/10)
  patron(String.raw`\bsiguen? confirmad[oa]s?\b`, "g"),
  patron(String.raw`${LISTO}confirmad[oa]\b`, "g"), // «¡Confirmado, Walter!», «Listo, confirmado»
  patron(String.raw`\b(?:te |le )?(?:lo|la) confirmé\b`, "g"), // «ya te lo confirmé»
  patron(String.raw`\bconfirmé (?:el|tu|su|la) (?:turno|reserva|visita|cita|asistencia)\b`, "g"),
  patron(String.raw`\bte confirmo (?:el|tu) (?:turno|reserva|visita)\b`, "g"),
];
// «Queda confirmado» de otra cosa: «el color quedó confirmado», «tu mail está confirmado».
const OTRA_COSA = patron(String.raw`\b(?:talles?|precios?|valor(?:es)?|colou?r(?:es)?|modelos?|disponibilidad|stock|medidas?|datos?|mails?|correos?|pagos?|señas?)\b`);
const MOVER = [
  patron(String.raw`\b(?:te lo|te la|se lo|se la|lo|la) (?:moví|reprogramé)\b`, "g"),
  patron(String.raw`\b(?:moví|reprogramé|pasé|cambié|corrí) (?:el|tu|su|la) (?:turno|reserva|visita|cita)\b`, "g"),
  patron(String.raw`\breprogramé\b`, "g"),
  patron(String.raw`\b${QUEDA} reprogramad[oa]s?\b`, "g"),
];
// «Te lo pasé» o «quedó cambiado» son un turno movido solo si dicen a cuándo (si no, «te lo pasé» es
// un link: ver LINK_CLITICO).
const MOVER_CON_CUANDO = [
  patron(String.raw`\b(?:te lo|te la|se lo|se la|lo|la) (?:pasé|cambié|corrí)\b`, "g"),
  patron(String.raw`\b${QUEDA} (?:movid|cambiad|pasad)[oa]s?\b`, "g"),
];
const CANCELAR = [
  patron(String.raw`\b(?:${CLITICO} )?(?:cancelé|anulé)\b`, "g"),
  patron(String.raw`\bdi de baja\b`, "g"),
  patron(String.raw`\b${QUEDA} (?:cancelad|anulad)[oa]s?\b`, "g"),
  patron(String.raw`${LISTO}(?:cancelad|anulad)[oa]\b`, "g"),
];
// «Quedó cancelado el casamiento», «la graduación quedó para el 5 de diciembre»: es del cliente, no un turno.
const DEL_EVENTO = patron(String.raw`\b(?:eventos?|casamientos?|fiestas?|bodas?|graduación|graduacion|viajes?|vuelos?|cumpleaños|cumples?)\b`);

const COSAS: readonly (readonly [Cosa, string])[] = [
  ["catalogo", String.raw`catálogos?|catalogos?|webs?|páginas?|paginas?|sitio|tienda`],
  ["mapa", String.raw`mapa|ubicación|ubicacion`],
  ["resena", String.raw`reseña|resena`],
  ["link", String.raw`links?|enlaces?`],
  ["fotos", String.raw`fotos?|fotitos|imágenes|imagenes`],
];
const COSA = COSAS.map(([, f]) => f).join("|");
const ES_COSA = COSAS.map(([cosa, f]) => [cosa, patron(String.raw`^(?:${f})$`)] as const);
const cosaDe = (palabra: string): Cosa | undefined => ES_COSA.find(([, re]) => re.test(palabra))?.[0];
const MANDE = String.raw`mandé|envié|pasé|dejé|compartí|comparti|adjunté`;
const ES_PASADO = patron(String.raw`^(?:${MANDE})$`);
const MANDO = String.raw`mando|envío|envio|paso|dejo|comparto|adjunto`;
const VOY_A = String.raw`voy a (?:mandar|enviar|pasar|dejar|compartir)`;
// Hasta tres palabras entre el verbo y la cosa: «te comparto también el catálogo online».
const ENTRE = String.raw`(?: [\p{L}]+){0,3}?`;
// «te paso el catálogo», «te mandé el link», «te voy a pasar el mapa» (el verbo queda en el grupo 1 y la
// cosa en el 2).
const LINK_DIRECTO = patron(String.raw`\b(?:te|le|les) (${MANDE}|${MANDO}|${VOY_A})${ENTRE} (${COSA})\b`, "g");
const LINK_ENCLITICO = patron(String.raw`\b(voy a (?:mandar|enviar|pasar|dejar|compartir)(?:te|les|le))${ENTRE} (${COSA})\b`, "g");
const LINK_ACA = patron(String.raw`\b((?:acá|aca|ahí|ahi) (?:tenés|tenes|tienen|va|van))${ENTRE} (${COSA})\b`, "g");
// «el catálogo que te envié»: nombra uno que ya mandó; vale si le llegó en esta charla.
const LINK_REFERIDO = patron(String.raw`\b(${COSA})(?: [\p{L}]+){0,2}? que (?:te|les|le) (?:${MANDE})\b`, "g");
// «te lo paso por acá»: un link solo si la oración o el mensaje del cliente nombran uno.
const LINK_CLITICO = patron(String.raw`\b(?:te|le|les) (?:lo|la|los|las) (${MANDE}|${MANDO})\b`, "g");
const NOMBRA_COSA = patron(String.raw`\b(${COSA})\b`);

const GUARDE = String.raw`anoté|guardé|registré|cargué|actualicé|agregué|sumé`;
const DATO = String.raw`mails?|correos?|e-?mails?|gmail|nombres?|apellidos?|datos?|fechas?|eventos?|talles?|teléfonos?|telefonos?|números?|numeros?|colou?r(?:es)?|ciudad|preferencias?|notas?`;
const DATOS_DIRECTO = patron(String.raw`\b(?:${GUARDE})(?: [\p{L}]+){0,2}? (${DATO})\b`, "g"); // «anoté tu mail», «guardé la fecha»
const DATOS = [
  patron(String.raw`\b(?:${GUARDE}) que\b`, "g"), // «anoté que el evento es el 5 de diciembre»
  patron(String.raw`\btomé nota\b`, "g"),
  patron(String.raw`\b(?:lo|la|los|las) (?:anoté|guardé|registré|cargué|agregué|sumé)\b(?! (?:para|el|a las)\b)`, "g"), // «ya lo anoté»
  patron(String.raw`\bdejé (?:anotad|registrad|guardad)[oa]s?\b`, "g"), // «ya lo dejé anotado»
];
// «Queda anotado que venís con tu sobrino», «tu mail quedó registrado». Con un turno y sin un dato
// («tu turno quedó registrado») es una reserva.
const DATOS_QUEDA = patron(String.raw`\b${QUEDA} (?:anotad|guardad|registrad|cargad|actualizad)[oa]s?\b`, "g");
const NOMBRA_DATO = patron(String.raw`\b(?:${DATO})\b`, "g");
// De qué campo de la ficha habla («anoté tu mail» ya era verdad si la ficha tenía el mail).
const CAMPO_DE_DATO: readonly (readonly [RegExp, string])[] = [
  [/mail|correo/, "email"],
  [/nombre|apellido/, "nombre"],
  [/fecha/, "fecha_evento"],
  [/evento/, "evento"],
  [/talle/, "talle_aprox"],
  [/colou?r/, "color_preferido"],
  [/ciudad/, "ciudad"],
  [/tel[eé]fono|n[uú]mero/, "telefono"], // el de WhatsApp: siempre lo tenemos
];

// --- Cuándo: el día y la hora que nombra la oración, para compararlos con los turnos del cliente ---

type Cuando = { horas: string[]; dias: number[]; semana: number[]; enDias: number[] };
const DIA_SEMANA: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

export function cuandoDice(texto: string): Cuando | null {
  const n = normalizar(texto);
  const c: Cuando = { horas: horas(texto), dias: [], semana: [], enDias: [] };
  for (const m of n.matchAll(new RegExp(`\\b(\\d{1,2}) de (?:${MESES})\\b`, "g"))) c.dias.push(Number(m[1]));
  for (const m of n.matchAll(/\b(\d{1,2})\/\d{1,2}(?:\/\d{2,4})?\b/g)) c.dias.push(Number(m[1]));
  for (const m of n.matchAll(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b(?: (\d{1,2})\b(?![:.]\d))?/g)) {
    c.semana.push(DIA_SEMANA[m[1]]);
    if (m[2]) c.dias.push(Number(m[2]));
  }
  // «el 13», «del 30» (día del mes), pero no «el 13:00» ni «el 13 hs».
  for (const m of n.matchAll(/\b(?:el|del) (\d{1,2})\b(?![:.]\d)(?! ?(?:hs|h|horas)\b)/g)) {
    if (Number(m[1]) >= 1 && Number(m[1]) <= 31) c.dias.push(Number(m[1]));
  }
  if (/\bhoy\b/.test(n)) c.enDias.push(0);
  if (/\bpasado manana\b/.test(n)) c.enDias.push(2);
  else if (/(?<!\bla )\bmanana\b/.test(n)) c.enDias.push(1); // «mañana», no «a la mañana»
  return c.horas.length || c.dias.length || c.semana.length || c.enDias.length ? c : null;
}

const coincide = (t: TurnoDelCliente, c: Cuando) =>
  (!c.horas.length || c.horas.includes(t.hora)) && (!c.dias.length || c.dias.includes(t.dia)) &&
  (!c.semana.length || c.semana.includes(t.diaSemana)) && (!c.enDias.length || c.enDias.includes(t.enDias));

// --- Qué promete cada parte del mensaje ---

// Lo que viene antes de la promesa no la vuelve una condición, una negación ni algo que contó otro.
function esAfirmacion(m: string, i: number): boolean {
  const antes = m.slice(0, i);
  if (CONDICION.test(antes)) return false;
  const tramo = antes.split(/[,;:—–(]/).pop() ?? "";
  return !NEGACION.test(tramo) && !LO_DIJO_OTRO.test(tramo);
}

function coincidencias(m: string, patrones: readonly RegExp[]): RegExpMatchArray[] {
  return patrones.flatMap((p) => [...m.matchAll(p)]).filter((x) => esAfirmacion(m, x.index ?? 0));
}

// Las promesas de una parte del mensaje (una oración, o un pedazo entre «;»). Una pregunta no promete
// nada: si la parte trae «¿», se lee solo lo de antes («Te paso el catálogo, ¿te sirve?»).
export function promesasEn(parte: string, mensajeCliente?: string | null): Promesa[] {
  let afirmacion = parte.trim();
  if (afirmacion.includes("¿")) afirmacion = afirmacion.slice(0, afirmacion.indexOf("¿"));
  else if (afirmacion.endsWith("?")) return [];
  const m = minuscula(afirmacion);
  if (!m) return [];
  const frase = parte.trim();
  const cuando = cuandoDice(afirmacion) !== null;
  const deTurno = DE_TURNO.test(m);
  const deTraje = DE_TRAJE.test(m) && !deTurno;
  const promesas: Promesa[] = [];
  const sumar = (p: Omit<Promesa, "frase" | "afirmacion">) => {
    if (!promesas.some((x) => x.familia === p.familia && x.cosa === p.cosa)) promesas.push({ ...p, frase, afirmacion });
  };
  const despues = (x: RegExpMatchArray) => m.slice((x.index ?? 0) + x[0].length);
  const camposDe = (palabras: string[]) =>
    [...new Set(palabras.flatMap((d) => CAMPO_DE_DATO.filter(([re]) => re.test(normalizar(d))).map(([, c]) => c)))];
  const esPasado = (verbo: string) => ES_PASADO.test(verbo);

  // Datos primero: «te anoté el mail» es un dato, no un turno. El campo de la ficha sale de lo que
  // nombra («anoté tu mail» → email); «anoté que…» o «ya lo anoté» no dicen cuál y solo valen con la
  // herramienta.
  const directos = coincidencias(m, [DATOS_DIRECTO]);
  let hayDatos = directos.length > 0 || coincidencias(m, DATOS).length > 0;
  let campos = camposDe(directos.map((x) => x[1]));
  if (coincidencias(m, [DATOS_QUEDA]).length) {
    const nombrados = [...m.matchAll(NOMBRA_DATO)].map((d) => d[0]);
    if (deTurno && !nombrados.length) {
      sumar({ familia: "agendar" }); // «tu turno quedó registrado»
    } else if (!deTraje) {
      hayDatos = true;
      campos = [...new Set([...campos, ...camposDe(nombrados)])];
    }
  }
  if (hayDatos) sumar({ familia: "datos", campos });

  if (!deTraje) {
    if (coincidencias(m, AGENDAR).some((x) => !CONDICION_DESPUES.test(despues(x)))) sumar({ familia: "agendar" });
    const delEvento = DEL_EVENTO.test(m) && !deTurno;
    if (cuando && !delEvento && coincidencias(m, AGENDAR_CON_CUANDO).length) sumar({ familia: "agendar" });
    if (horas(afirmacion).length && !delEvento && coincidencias(m, AGENDAR_CON_HORA).length) sumar({ familia: "agendar" });
  }
  // «Queda confirmado que vienen los dos» confirma un dato, no el turno (eso es «anotalo»).
  const confirma = coincidencias(m, CONFIRMAR).filter((x) => !CONDICION_DESPUES.test(despues(x)) && !/^ que\b/u.test(despues(x)));
  if (confirma.length && !(OTRA_COSA.test(m) && !deTurno) && !deTraje) sumar({ familia: "confirmar" });
  if (coincidencias(m, MOVER).length || (cuando && coincidencias(m, MOVER_CON_CUANDO).length)) sumar({ familia: "mover" });
  if (coincidencias(m, CANCELAR).length && !((DEL_EVENTO.test(m) || DE_TRAJE.test(m)) && !deTurno)) {
    sumar({ familia: "cancelar" });
  }

  // «El link de la reseña», «el link del catálogo»: si después de «link» dice cuál, cuenta ese.
  const cualLink = (x: RegExpMatchArray, cosa: Cosa | undefined): Cosa | undefined => {
    if (cosa !== "link") return cosa;
    const resto = despues(x).match(NOMBRA_COSA)?.[1];
    const especifica = resto ? cosaDe(resto) : undefined;
    return especifica && especifica !== "link" ? especifica : cosa;
  };
  for (const x of coincidencias(m, [LINK_DIRECTO, LINK_ENCLITICO, LINK_ACA])) {
    const cosa = cualLink(x, cosaDe(x[2]));
    if (cosa) sumar({ familia: "link", cosa, pasado: esPasado(x[1]) });
  }
  for (const x of coincidencias(m, [LINK_REFERIDO])) {
    const cosa = cosaDe(x[1]);
    if (cosa) sumar({ familia: "link", cosa, pasado: true });
  }
  // «Te lo paso por acá»: qué es «lo» lo dice la oración o lo que pidió el cliente («pasame el catálogo»).
  // Si dice a cuándo, es un turno movido (MOVER_CON_CUANDO), no un link.
  if (!cuando) {
    for (const x of coincidencias(m, [LINK_CLITICO])) {
      const nombrada = m.match(NOMBRA_COSA)?.[1] ?? minuscula(mensajeCliente ?? "").match(NOMBRA_COSA)?.[1];
      const cosa = nombrada ? cosaDe(nombrada) : undefined;
      if (cosa) sumar({ familia: "link", cosa, pasado: esPasado(x[1]) });
    }
  }
  return promesas;
}

// --- Si ya está hecha: en este turno (traza.llamadas) o en la base desde antes ---

const llamo = (traza: Traza, herramienta: string, accion?: string) =>
  traza.llamadas.some((l) =>
    l.ok && l.herramienta === herramienta && (!accion || (l.argumentos as { accion?: string } | null)?.accion === accion)
  );

const TIPOS_DE: Record<Cosa, readonly string[]> = {
  catalogo: ["web", "web-venta"],
  fotos: ["web", "web-venta"],
  mapa: ["mapa"],
  resena: ["resena"],
  link: TIPOS_LINK,
};

function mandoLink(traza: Traza, tipos: readonly string[]): boolean {
  return traza.llamadas.some((l) => {
    if (!l.ok || l.herramienta !== "enviar_link") return false;
    const tipo = (l.argumentos as { tipo?: string } | null)?.tipo;
    return !tipo || tipos.includes(tipo);
  });
}

export function cumplida(p: Promesa, e: Pick<EntradaBarandilla, "traza">): boolean {
  const t = e.traza;
  const turnos = t.turnosCliente ?? [];
  const cuando = cuandoDice(p.afirmacion);
  const losQueDice = cuando ? turnos.filter((x) => coincide(x, cuando)) : turnos;
  const agendo = llamo(t, "agendar_turno");
  const movio = llamo(t, "cambiar_turno", "mover");
  switch (p.familia) {
    case "agendar":
      return agendo || movio || losQueDice.length > 0;
    case "confirmar":
      // Agendar o mover en este turno también «deja confirmado» el horario, en el sentido en que lo dice
      // el cliente; la confirmación repetida la recorta confirmacion_doble.
      return llamo(t, "cambiar_turno", "confirmar") || agendo || movio || losQueDice.some((x) => x.confirmado);
    case "mover":
      // Sin día ni hora no hay cómo saber si ya estaba movido: «listo, te lo cambié» tiene que venir con
      // cambiar_turno en este turno.
      return movio || agendo || (cuando !== null && losQueDice.length > 0);
    case "cancelar":
      // Ya cancelado es que ya no figura entre sus turnos activos.
      return llamo(t, "cambiar_turno", "cancelar") || (cuando ? losQueDice.length === 0 : turnos.length === 0);
    case "link": {
      const tipos = TIPOS_DE[p.cosa ?? "link"];
      return mandoLink(t, tipos) || (p.pasado === true && (t.linksPrevios ?? []).some((x) => tipos.includes(x)));
    }
    case "datos": {
      if (llamo(t, "guardar_datos_cliente") || agendo) return true;
      const campos = p.campos ?? [];
      const conocidos = t.datosConocidos ?? [];
      return campos.length > 0 && campos.every((c) => c === "telefono" || conocidos.includes(c));
    }
  }
}

// --- Qué decirle al modelo, y qué queda en la bitácora ---

const QUE_FALTO: Record<Familia, string> = {
  agendar: "agendar_turno",
  confirmar: "cambiar_turno con accion confirmar",
  mover: "cambiar_turno con accion mover",
  cancelar: "cambiar_turno con accion cancelar",
  link: "enviar_link",
  datos: "guardar_datos_cliente",
};

function queFalto(p: Promesa): string {
  if (p.familia !== "link") return QUE_FALTO[p.familia];
  if (p.cosa === "mapa") return "enviar_link con tipo mapa";
  if (p.cosa === "resena") return "enviar_link con tipo resena";
  if (p.cosa === "link") return "enviar_link";
  return "enviar_link con tipo web";
}

const cita = (frase: string) => `«${frase.length > 140 ? `${frase.slice(0, 137).trimEnd()}…` : frase}»`;

export function instruccion(p: Promesa): string {
  const c = cita(p.frase);
  switch (p.familia) {
    case "agendar":
      return `dijiste que el turno quedó agendado (${c}) pero en este turno no llamaste a agendar_turno: si el cliente ` +
        "eligió día y hora, llamá a buscar_horarios y a agendar_turno; si no, no digas que quedó agendado";
    case "confirmar":
      return `dijiste que el turno quedó confirmado (${c}) pero no llamaste a cambiar_turno con accion confirmar: si el ` +
        "cliente lo confirma, llamala con el turno_id de sus turnos; si no, no digas que quedó confirmado";
    case "mover":
      return `dijiste que moviste el turno (${c}) pero no llamaste a cambiar_turno con accion mover: llamá a ` +
        "buscar_horarios y a cambiar_turno con el horario que eligió, o no digas que lo moviste";
    case "cancelar":
      return `dijiste que el turno quedó cancelado (${c}) pero no llamaste a cambiar_turno con accion cancelar: si no ` +
        "va a venir, llamala con el motivo; si no, no digas que lo cancelaste";
    case "datos":
      return `dijiste que anotaste sus datos (${c}) pero no llamaste a guardar_datos_cliente: llamala con lo que te ` +
        "dijo, o no digas que lo anotaste";
    case "link":
      return instruccionDeLink(p, c);
  }
}

const QUE_LINK: Record<Cosa, string> = {
  catalogo: "el catálogo",
  fotos: "fotos",
  mapa: "la ubicación",
  resena: "el link de la reseña",
  link: "un link",
};

function instruccionDeLink(p: Promesa, c: string): string {
  // Desde el 9/10 no hay herramienta de fotos (enviar_fotos se fue): los modelos se ven en el catálogo.
  if (p.cosa === "fotos") {
    return `dijiste que le mandás fotos (${c}) pero vos no mandás fotos: si quiere ver modelos, mandale el catálogo ` +
      "con enviar_link (tipo web); si no, no lo digas";
  }
  const que = QUE_LINK[p.cosa ?? "link"];
  if (p.pasado) {
    return `dijiste que ya le mandaste ${que} (${c}) pero no le llegó en esta charla: llamá a ${queFalto(p)} ` +
      "(el link lo manda el sistema aparte) o no digas que se lo mandaste";
  }
  return `dijiste que le mandás ${que} (${c}) pero en este turno no llamaste a ${queFalto(p)}: llamala (el link ` +
    "lo manda el sistema aparte) o no lo digas";
}

// Cada línea (las burbujas se respetan), en oraciones, y cada oración en sus partes entre «;».
function partes(texto: string): string[] {
  return texto.split(/\n+/).flatMap((l) => l.split(/(?<=[.!?…])\s+/)).flatMap((o) => o.split(/;\s*/)).filter((p) => p.trim());
}

export function promesasSinHacer(e: EntradaBarandilla): Promesa[] {
  return partes(e.texto).flatMap((p) => promesasEn(p, e.mensajeCliente)).filter((p) => !cumplida(p, e));
}

const letras = (s: string) => (s.match(/\p{L}/gu) ?? []).length;

// Segundo intento: se saca la parte de la oración con la promesa (o la oración entera si es toda
// promesa) y sale el resto. Como en precio_sin_herramienta, si queda algo sin contenido («Perfecto,
// Walter.») devuelve "" y lo resuelve index.ts como cualquier corte que vacía el mensaje.
export function sinLasPromesas(e: EntradaBarandilla): string {
  const sigue = (parte: string) => promesasEn(parte, e.mensajeCliente).every((p) => cumplida(p, e));
  const linea = (l: string) =>
    l.split(/(?<=[.!?…])\s+/).map((oracion) => {
      const trozos = oracion.split(/;\s*/);
      const quedan = trozos.filter((t) => !t.trim() || sigue(t));
      if (quedan.length === trozos.length) return oracion;
      let r = quedan.join("; ").trim();
      if (!r) return "";
      if (!/[.!?…]$/.test(r)) r += ".";
      return r.charAt(0).toLocaleUpperCase("es") + r.slice(1);
    }).filter(Boolean).join(" ").trim();
  const resultado = e.texto.split(/(\n+)/).map((b) => (/^\n+$/.test(b) ? b : linea(b))).join("")
    .replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  return letras(resultado) < 15 ? "" : resultado;
}

export const promesaSinHacer: Barandilla = {
  nombre: "promesa_sin_hacer",
  etapa: "reglas",
  accion: "rehacer",
  evaluar(e) {
    const incumplidas = promesasSinHacer(e);
    if (!incumplidas.length) return NO_SALTA;
    const motivo = [...new Set(incumplidas.map(instruccion))].join("; ");
    if (!e.saltosPrevios) return { salta: true, accion: "rehacer", motivo };
    // Segundo intento: ya se le pidió una vez y volvió a prometer sin hacerlo. Se saca la promesa en
    // código y queda en la Bitácora del panel (etapa auditor_promesas), con qué prometió y qué faltó.
    const promesa = [...new Set(incumplidas.map((p) => p.frase))].join(" / ");
    const falto = [...new Set(incumplidas.map(queFalto))].join("; ");
    return {
      salta: true,
      accion: "cortar",
      motivo: `${motivo} (segundo intento: se sacó en código la oración)`,
      texto: sinLasPromesas(e),
      registro: {
        etapa: "auditor_promesas",
        tipos: [...new Set(incumplidas.map((p) => p.familia))],
        promesa,
        falto,
        resumen: `Auditor de promesas: Lucía dijo ${cita(promesa)} sin haberlo hecho (faltó ${falto}); se sacó del mensaje.`,
      },
    };
  },
};
