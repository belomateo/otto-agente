// una_pregunta (formato) — una sola pregunta por mensaje (AGENTE.md § 1 y § 6). Con más de un
// "?" de cierre, el modelo lo rehace. Varios "??" seguidos cuentan como uno.

import { type Barandilla, NO_SALTA } from "./tipos.ts";

export function contarPreguntas(t: string): number {
  return (String(t ?? "").match(/\?+/g) ?? []).length;
}

export const unaPregunta: Barandilla = {
  nombre: "una_pregunta",
  etapa: "formato",
  accion: "rehacer",
  evaluar({ texto }) {
    const n = contarPreguntas(texto);
    if (n <= 1) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: `${n} preguntas en un mensaje: tiene que haber una sola, al final`,
    };
  },
};
