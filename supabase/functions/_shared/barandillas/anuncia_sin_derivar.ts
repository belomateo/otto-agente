// anuncia_sin_derivar (reglas) — nunca se anuncia un pase sin ejecutarlo (principio 7): el
// cliente quedaría esperando a alguien que nunca se enteró. Si Lucía dice que le pasa la
// consulta al equipo y no llamó a derivar_a_persona, el código ejecuta la derivación; como
// después nadie lee la respuesta, también se sacan las preguntas.

import { llamoA } from "../traza.ts";
import { contieneFrase, normalizar, sacarPreguntas } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

export const ANUNCIOS_DE_PASE = [
  "te paso con",
  "le paso con",
  "te paso tu consulta",
  "le paso tu consulta",
  "paso tu consulta",
  "te derivo",
  "le derivo",
  "te comunico con",
  "te pongo en contacto",
  "te va a escribir alguien",
  "te escribe alguien",
  "te va a contactar",
  "te contacta alguien",
  "alguien del equipo te va a",
  "un asesor te va a",
];

export const anunciaSinDerivar: Barandilla = {
  nombre: "anuncia_sin_derivar",
  etapa: "reglas",
  accion: "ejecutar_derivacion",
  evaluar({ texto, traza }) {
    if (llamoA(traza, "derivar_a_persona")) return NO_SALTA;
    const n = normalizar(texto);
    const anuncio = ANUNCIOS_DE_PASE.find((a) => contieneFrase(n, a));
    if (!anuncio) return NO_SALTA;
    return {
      salta: true,
      accion: "ejecutar_derivacion",
      motivo: `anuncia un pase («${anuncio}») sin llamar a derivar_a_persona: el código ejecuta la derivación`,
      texto: sacarPreguntas(texto),
    };
  },
};
