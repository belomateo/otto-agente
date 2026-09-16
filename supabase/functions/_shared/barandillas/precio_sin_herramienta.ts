// precio_sin_herramienta (contenido) — todo precio sale de consultar_catalogo o de
// consultar_accesorios en este turno (reglas 8 y 9). Se leen los montos del texto ($150.000,
// 150000, 150 mil) y cada uno tiene que ser uno que haya devuelto una herramienta: un precio
// sin herramienta o un total armado sumando se rehace. Una dirección (España 764) o un talle
// no son montos.
//
// Hallazgo de Mateo, 16/9: "te sale como 150" pasaba sin control — un monto corto y pelado (sin
// $, sin "mil", sin separador de miles) es la forma más común de decir un precio en pesos
// argentinos hablando ($150.000 dicho "ciento cincuenta" se escribe informalmente "150"). Se
// suma acá, pero solo pegado a una palabra de precio (sale, cuesta, son, anda en, o "nomás"
// después del número): un bare "150" suelto en cualquier otro lado sigue sin ser un monto. "son"
// es ambiguo ("son 44 invitados" también pega) — un falso positivo acá cuesta un rehacer, no
// rompe el turno; se prefiere eso a dejar pasar un precio inventado.

import { type Barandilla, NO_SALTA } from "./tipos.ts";

const aNumero = (s: string) => Number(s.replace(/[.\s]/g, ""));

export function montos(t: string): number[] {
  const texto = String(t ?? "");
  const res = new Set<number>();
  for (const m of texto.matchAll(/\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/g)) res.add(aNumero(m[1]));
  for (const m of texto.matchAll(/(?<![\d$.,])(\d{1,3}(?:\.\d{3})+)(?![\d.,])/g)) res.add(aNumero(m[1]));
  for (const m of texto.matchAll(/(?<![\d$.,])(\d{5,})(?![\d.,])/g)) res.add(Number(m[1]));
  for (const m of texto.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:mil|lucas|k)\b/gi)) {
    res.add(Math.round(Number(m[1].replace(",", ".")) * 1000));
  }
  // Un monto corto (2 o 3 cifras) pegado a una palabra de precio, sin "mil"/"lucas"/"k" después
  // (eso ya lo atrapó la regla de arriba, y es OTRO monto: "sale 150 mil" es $150.000, no
  // $150 Y $150.000).
  for (const m of texto.matchAll(/\b(?:sale|cuesta|cuestan|son|anda(?:n)?\s+en)\s+(?:como\s+)?\$?\s*(\d{2,3})\b(?!\s*(?:mil|lucas|k)\b)/gi)) {
    res.add(Number(m[1]));
  }
  for (const m of texto.matchAll(/(?<![\d.,])(\d{2,3})\s+nom[aá]s\b/gi)) res.add(Number(m[1]));
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
