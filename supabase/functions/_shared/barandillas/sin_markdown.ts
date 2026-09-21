// sin_markdown (formato) — texto de WhatsApp, sin markdown "de verdad" (que WhatsApp no
// renderiza y sale como asteriscos o números literales), sin títulos (AGENTE.md § 1 y § 6). Si
// aparece, se limpia en código y el mensaje sale.
//
// Pedido de Mateo, 21/9 (vía logica): que Lucía use NEGRITAS para destacar lo importante, con el
// *asterisco simple* que WhatsApp sí renderiza como negrita de verdad — logica ya verificó que
// prepararParaEnviar (suyo) lo deja pasar intacto. Antes esto se trataba igual que "**negrita**"
// (markdown de verdad, que en WhatsApp queda como asteriscos dobles sueltos) y se borraba en
// código sin que el prompt pudiera hacer nada: sacado de PATRONES y de limpiarMarkdown. Sigue
// prohibido "**doble**" (no es sintaxis de WhatsApp, sale literal) y las viñetas con guion o
// bullet (Mateo pidió pasos numerados con emoji — 1️⃣2️⃣ — no una lista con "- ").

import { type Barandilla, NO_SALTA } from "./tipos.ts";

const PATRONES: { que: string; re: RegExp }[] = [
  { que: "negrita **", re: /\*\*[^*\n]+\*\*/ },
  { que: "negrita __", re: /__[^_\n]+__/ },
  { que: "título #", re: /^\s{0,3}#{1,6}\s+\S/m },
  { que: "viñeta", re: /^\s*[-*•]\s+\S/m },
  { que: "bloque de código", re: /```/ },
  { que: "link en markdown", re: /\[[^\]\n]+\]\([^)\s]+\)/ },
];

export function limpiarMarkdown(t: string): string {
  return t
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1");
}

export const sinMarkdown: Barandilla = {
  nombre: "sin_markdown",
  etapa: "formato",
  accion: "limpiar",
  evaluar({ texto }) {
    const hallados = PATRONES.filter((p) => p.re.test(texto)).map((p) => p.que);
    if (hallados.length === 0) return NO_SALTA;
    return {
      salta: true,
      accion: "limpiar",
      motivo: `markdown en la respuesta (${hallados.join(", ")}): se limpió en código`,
      texto: limpiarMarkdown(texto),
    };
  },
};
