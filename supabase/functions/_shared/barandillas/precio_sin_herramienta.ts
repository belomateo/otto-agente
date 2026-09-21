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
  /\btalle\s+\d{2,3}\b/g, // "talle 48"
  /\bdel?\s+\d{2,3}\s+al?\s+\d{2,3}\b/g, // rango de talles: "del 44 al 68"
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
  return normalizado.replace(new RegExp(`\\b${escaparRegex(nombre)}\\b`, "g"), (m) => "·".repeat(m.length));
}

export function montos(t: string, nombreCliente?: string | null): number[] {
  let crudo = normalizar(String(t ?? ""));
  if (nombreCliente) crudo = enmascararNombre(crudo, nombreCliente);
  const res = new Set<number>();
  for (const m of crudo.matchAll(/\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/g)) res.add(aNumero(m[1]));
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
