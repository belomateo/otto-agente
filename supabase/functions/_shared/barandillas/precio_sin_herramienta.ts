// precio_sin_herramienta (contenido) — todo precio sale de consultar_catalogo o de
// consultar_accesorios en este turno (reglas 8 y 9). Se leen los montos del texto ($150.000,
// 150000, 150 mil) y cada uno tiene que ser uno que haya devuelto una herramienta: un precio
// sin herramienta o un total armado sumando se rehace.
//
// Hallazgo de Mateo, 16/9: la primera versión de esto (16/9, a la mañana) buscaba un monto corto
// y pelado (sin $, sin "mil") solo pegado a una lista fija de palabras de precio ("sale",
// "cuesta", "son", "anda en"). Se escapaba con cualquier frase que no estuviera en la lista: "te
// queda en unos 150", "te lo dejo en 150", "por 150 te llevás el combo", "arranca en 150". Dado
// vuelta: en vez de una lista de palabras que SÍ valen, cualquier número suelto de 2 o 3 cifras
// es sospechoso — y se descarta solo si el contexto lo explica de otra forma (un talle, una
// altura, la dirección del local, una hora, una edad, una cantidad de cuotas o de personas). La
// acción de esta barandilla es "rehacer", no "derivar": un falso positivo sale barato (Lucía
// reescribe el mensaje), así que conviene errar de este lado antes que dejar pasar un precio
// inventado.
//
// Hallazgo de logica probando en vivo, 20/9 (bug real, prioridad alta): "sale barato" dejó de
// ser cierto para un caso puntual pero garantizado — un nombre de perfil de WhatsApp con un
// número chico ("Martin 23", "Caro 22", "Juan 10"). Lucía saluda por el nombre en el primer
// mensaje de la charla, la barandilla lee el número como precio, pide rehacer, y el modelo
// vuelve a saludar por el MISMO nombre porque no puede evitarlo: barandilla_doble garantizado,
// siempre, en el primerísimo mensaje. Ahora se enmascara el nombre del cliente antes de buscar
// montos (ver enmascararNombre).

import { normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const aNumero = (s: string) => Number(s.replace(/[.\s]/g, ""));

// Contextos donde un número de 2 o 3 cifras NO es un precio. Se enmascaran ANTES de buscar
// números sueltos (así "talle 48" no dispara con el 48, pero "sale 48" sí).
const CONTEXTOS_QUE_NO_SON_PRECIO: RegExp[] = [
  /\d+(?:[.,]\d+)?\s*(?:mil|lucas|k)\b/g, // "150 mil": ya lo cuenta la regla del millar, es OTRO monto
  // Horarios y minutos (revisión de las últimas 30 charlas, 4/10): "los sábados hasta las 18",
  // "de 9:30 a 12", "entre las 10 y las 18" y "10 minutos de tolerancia" se leían como precios
  // de $18, $12, $10. Con cuatro preguntas juntas (horarios, seña, precio, pagos) Lucía lo
  // contestó bien, la barandilla saltó dos veces y la charla terminó derivada.
  /\b(?:de|desde)\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\s*(?:a|hasta)\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\b/g,
  /\blas?\s+\d{1,2}(?:[:.]\d{2})?\b(?!\s*(?:mil|lucas|k)\b)/g,
  /\b\d{1,3}\s*(?:minutos?|min)\b/g,
  // Cumples de 15: "un cumple de 15", "una fiesta de 15", "tu 15".
  /\b(?:cumple|fiesta|fiestas|quince)\s+de\s+\d{1,2}\b/g,
  /\b(?:un|tu|su|sus|los)\s+15\b/g,
  /\btalles?\s+\d{1,3}\s*(?:al?|hasta|[-–])\s*\d{1,3}\b/g, // "talles 4–16"
  // Talles y edades de chicos (5/10, repitiendo una charla con preguntas por un nene): "talles 14
  // y 16", "en talle 14 o 16", "un chico de 12", "le puede ir un 14" se leían como precios.
  /\btalles?\s+\d{1,3}(?:\s*(?:,|y|o|[-–/])\s*(?:el\s+)?\d{1,3})+\b/g,
  /\b(?:chicos?|chicas?|nenes?|nenas?|ninos?|ninas?|hijos?|hijas?|pibes?)\s+de\s+\d{1,2}(?:\s+a\s+\d{1,2})?\b/g,
  /\b(?:usa|usaria|calza|ir|va|iria|queda|quedaria)\s+(?:un|el)\s+\d{1,2}(?:\s+o\s+(?:un\s+|el\s+)?\d{1,2})?\b/g,
  /\btalle\s+\d{1,3}\b/g, // "talle 4" o "talle 48"
  /\bdel?\s+\d{1,3}\s+al?\s+\d{1,3}\b/g, // "del 4 al 16" y "del 44 al 68"
  /\b(?:mide|mido|medis|medimos|altura)\s+\d{2,3}\b/g, // "mide/medís 170", "altura 170"
  /\b\d{2,3}\s+de\s+altura\b/g, // "170 de altura"
  /\b\d{2,3}\s*cm\b/g, // "170cm" / "170 cm"
  /\ba\s+las?\s+\d{1,2}\b(?!\s*[:.]\d)/g, // hora sin dos puntos: "a las 15"
  /\b\d{1,2}\s*(?:hs|h|horas)\b/g, // hora: "15 hs"
  /\b\d{1,3}\s+(?:cuotas?|pagos?|meses)\b/g, // "en 3 cuotas"
  /\b\d{1,3}\s+(?:personas?|invitados?|pax|asistentes?|acompanantes?)\b/g, // cantidad de gente
  /\b\d{1,3}\s+anos\b/g, // edad: "tengo 44 años"
  /\bcumpleanos\s+de\s+\d{1,3}\b/g, // "cumpleaños de 15" (quinceañero: el número es el evento, no un precio)
  /\bespana\s+\d{2,4}\b/g, // la dirección del local (España 764)
  // Fechas y horarios de turno (hallazgo de Mateo, 16/9, URGENTE: rompía agendar_turno — "te
  // agendo el martes 23" leía 23 como precio, la barandilla no dejaba salir la confirmación).
  /\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+\d{1,2}\b/g, // "el martes 23"
  /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, // "23 de septiembre"
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // "23/9", "23/09/2026"
  // "el 23" a secas (sin día de la semana ni mes al lado, o con "de" seguido de algo que no es
  // un mes — "el 23 de la tarde"): en español nadie dice un precio así ("te sale el 90" no es
  // una frase real); acotado a 1-31 para no comerse un "el 150" si alguna vez apareciera.
  /\bel\s+(?:[12]?\d|3[01])\b/g,
  // Porcentaje (hallazgo de la auditoría, 17/9): "se abona el 100%" o "la seña es del 50 por
  // ciento" no son precios — son la sección que-incluye/reserva-y-garantia hablando de una
  // proporción, no un monto en pesos.
  /\b\d{1,3}\s*%/g,
  /\b\d{1,3}\s+por\s*ciento\b/g,
  // Días de anticipación (hallazgo en vivo, 1/10: 7 de 9 derivaciones por barandilla_doble en una
  // semana eran ESTO, no el modelo inventando precios). El fragmento "anticipacion" dice "lo
  // ideal es entre 60 y 7 días antes del evento" — Lucía lo cita bien (sale de
  // buscar_informacion, no inventado) y la barandilla igual lo lee como un precio de $60, pide
  // rehacer, Lucía repite el mismo dato porque es el correcto, y se cae a derivación. "entre A y B
  // días" va primero porque "60" ahí no está pegado a "días" (lo está "7"), así que el patrón
  // general de abajo no lo agarra solo.
  /\bentre\s+\d{1,3}\s+y\s+\d{1,3}\s+dias?\b/g,
  /\b\d{1,3}\s+dias?\b/g,
];

function enmascararContexto(normalizado: string): string {
  return CONTEXTOS_QUE_NO_SON_PRECIO.reduce((s, re) => s.replace(re, (m) => "·".repeat(m.length)), normalizado);
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// El nombre del cliente (probadores en vivo, 20/9, hallazgo de logica): un nombre de perfil de
// WhatsApp con un número chico ("Martin 23") revienta esto — Lucía saluda por el nombre ("Hola,
// Martin 23!"), la barandilla lee el 23 como precio, pide rehacer, el modelo vuelve a saludar
// por el mismo nombre (no puede evitarlo) y salta de nuevo: barandilla_doble garantizado, en el
// PRIMER mensaje de la charla, para cualquier nombre de WhatsApp con un número corto — "Juan 10",
// "Caro 22", "Fer 7" son comunísimos. Se enmascara el nombre ANTES de cualquier otra búsqueda
// (no solo la del número suelto): si alguna vez alguien se llama "Juan 15000", tampoco vale.
function enmascararNombre(normalizado: string, nombreCliente: string): string {
  const nombre = normalizar(nombreCliente).trim();
  if (!nombre) return normalizado;
  // Desde el 4/10 la ficha trae el nombre ya limpio ("Martin 23" → "Martin", nombre.ts): el número
  // que venga pegado atrás también es del perfil, no un precio.
  return normalizado.replace(new RegExp(`\\b${escaparRegex(nombre)}(?:\\s+\\d{1,4})?\\b`, "g"), (m) => "·".repeat(m.length));
}

// Teléfonos (Mateo, 5/10): con el evento hoy o mañana el sistema le pasa al cliente el número del
// local, y el 54, el 341 y el 239 de "+54 9 341 239 2502" se leían como precios: la pieza se
// descartaba y salía el texto genérico, sin el número. Un teléfono son diez dígitos o más, juntos
// o separados por un espacio o un guion (un precio separa los miles con punto). Va antes que todo,
// como el nombre, porque las reglas del millar y de cinco cifras también lo leerían.
const TELEFONO = /(?:\+\s?)?\d(?:[\s-]?\d){9,}/g;
const enmascararTelefonos = (normalizado: string) => normalizado.replace(TELEFONO, (m) => "·".repeat(m.length));

export function montos(t: string, nombreCliente?: string | null): number[] {
  let crudo = enmascararTelefonos(normalizar(String(t ?? "")));
  if (nombreCliente) crudo = enmascararNombre(crudo, nombreCliente);
  const res = new Set<number>();
  // "$150 mil" o "$33,5 mil" no son $150 ni $33: el monto lo cuenta la regla del millar de abajo
  // (4/10: Lucía dijo "$150 mil", saltó por "$150" y terminó sin dar el precio que tenía).
  for (const m of crudo.matchAll(/\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?(?![\d,])(?!\s*(?:mil|lucas|k)\b)/g)) res.add(aNumero(m[1]));
  for (const m of crudo.matchAll(/(?<![\d$.,])(\d{1,3}(?:\.\d{3})+)(?![\d.,])/g)) res.add(aNumero(m[1]));
  for (const m of crudo.matchAll(/(?<![\d$.,])(\d{5,})(?![\d.,])/g)) res.add(Number(m[1]));
  for (const m of crudo.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:mil|lucas|k)\b/g)) {
    res.add(Math.round(Number(m[1].replace(",", ".")) * 1000));
  }
  // Cualquier número suelto de 2 o 3 cifras, salvo que el contexto lo explique de otra forma.
  // Hallazgo de Mateo, 16/9 (tercera vuelta): (?![\d.,:]) descartaba con CUALQUIER puntuación
  // después, incluida la de la oración — "son 150, más el accesorio" y "son 150. Te sirve?" no
  // se detectaban, que es casi todo precio al final de una frase. El punto/coma/dos puntos solo
  // separa un número de otro (150.000, 15:30) cuando sigue OTRO DÍGITO pegado; si sigue una
  // palabra o un espacio, es puntuación de la oración y no descarta nada. Mismo criterio para
  // atrás: 000 en 150.000 va precedido de dígito+punto pegado, no de puntuación suelta.
  const enmascarado = enmascararContexto(crudo);
  for (const m of enmascarado.matchAll(/(?<!\d)(?<!\d[.,:])(\d{2,3})(?!\d)(?![.,:]\d)/g)) res.add(Number(m[1]));
  return [...res].filter((n) => Number.isFinite(n) && n > 0);
}

export const precioSinHerramienta: Barandilla = {
  nombre: "precio_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza, nombreCliente }) {
    const encontrados = montos(texto, nombreCliente);
    if (encontrados.length === 0) return NO_SALTA;
    const devueltos = new Set(traza.preciosDevueltos.map((p) => Math.round(p)));
    const fuera = encontrados.filter((m) => !devueltos.has(m));
    if (fuera.length === 0) return NO_SALTA;
    const lista = fuera.map((m) => `$${m.toLocaleString("es-AR")}`).join(", ");
    const motivo = devueltos.size === 0
      ? `un precio (${lista}) sin consultar_catalogo en este turno`
      : `un monto (${lista}) que no devolvió ninguna herramienta: no se suman precios ni se inventan totales`;
    return { salta: true, accion: "rehacer", motivo };
  },
};
