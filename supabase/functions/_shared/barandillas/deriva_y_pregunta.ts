// deriva_y_pregunta (reglas) — nunca se pregunta algo en el mismo mensaje en que se deriva
// (principio 7): después de derivar nadie lee la respuesta. Si derivó y hay una pregunta, se
// saca la pregunta en código y el resto sale.

import { llamoA } from "../traza.ts";
import { sacarPreguntas } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

export const derivaYPregunta: Barandilla = {
  nombre: "deriva_y_pregunta",
  etapa: "reglas",
  accion: "quitar_pregunta",
  evaluar({ texto, traza }) {
    if (!llamoA(traza, "derivar_a_persona") || !/[?¿]/.test(texto)) return NO_SALTA;
    return {
      salta: true,
      accion: "quitar_pregunta",
      motivo: "una pregunta en el mismo mensaje en que deriva: se sacó",
      texto: sacarPreguntas(texto),
    };
  },
};
