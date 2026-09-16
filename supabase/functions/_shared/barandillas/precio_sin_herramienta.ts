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

import { normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const aNumero = (s: string) => Number(s.replace(/[.\s]/g, ""));

// Contextos donde un número de 2 o 3 cifras NO es un precio. Se enmascaran ANTES de buscar
// números sueltos (así "talle 48" no dispara con el 48, pero "sale 48" sí).
const CONTEXTOS_QUE_NO_SON_PRECIO: RegExp[] = [
  /\d+(?:[.,]\d+)?\s*(?:mil|lucas|k)\b/g, // "150 mil": ya lo cuenta la regla del millar, es OTRO monto
  /\btalle\s+\d{2,3}\b/g, // "talle 48"
  /\bdel?\s+\d{2,3}\s+al?\s+\d{2,3}\b/g, // rango de talles: "del 44 al 68"
  /\b(?:mide|mido|altura)\s+\d{2,3}\b/g, // altura en cm
  /\ba\s+las?\s+\d{1,2}\b(?!\s*[:.]\d)/g, // hora sin dos puntos: "a las 15"
  /\b\d{1,2}\s*(?:hs|h|horas)\b/g, // hora: "15 hs"
  /\b\d{1,3}\s+(?:cuotas?|pagos?|meses)\b/g, // "en 3 cuotas"
  /\b\d{1,3}\s+(?:personas?|invitados?|pax|asistentes?|acompanantes?)\b/g, // cantidad de gente
  /\b\d{1,3}\s+anos\b/g, // edad: "tengo 44 años"
  /\bcumpleanos\s+de\s+\d{1,3}\b/g, // "cumpleaños de 15" (quinceañero: el número es el evento, no un precio)
  /\bespana\s+\d{2,4}\b/g, // la dirección del local (España 764)
];

function enmascararContexto(normalizado: string): string {
  return CONTEXTOS_QUE_NO_SON_PRECIO.reduce((s, re) => s.replace(re, (m) => "·".repeat(m.length)), normalizado);
}

export function montos(t: string): number[] {
  const crudo = normalizar(String(t ?? ""));
  const res = new Set<number>();
  for (const m of crudo.matchAll(/\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/g)) res.add(aNumero(m[1]));
  for (const m of crudo.matchAll(/(?<![\d$.,])(\d{1,3}(?:\.\d{3})+)(?![\d.,])/g)) res.add(aNumero(m[1]));
  for (const m of crudo.matchAll(/(?<![\d$.,])(\d{5,})(?![\d.,])/g)) res.add(Number(m[1]));
  for (const m of crudo.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:mil|lucas|k)\b/g)) {
    res.add(Math.round(Number(m[1].replace(",", ".")) * 1000));
  }
  // Cualquier número suelto de 2 o 3 cifras, salvo que el contexto lo explique de otra forma.
  const enmascarado = enmascararContexto(crudo);
  for (const m of enmascarado.matchAll(/(?<![\d.,:])(\d{2,3})(?![\d.,:])/g)) res.add(Number(m[1]));
  return [...res].filter((n) => Number.isFinite(n) && n > 0);
}

export const precioSinHerramienta: Barandilla = {
  nombre: "precio_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza }) {
    const encontrados = montos(texto);
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
