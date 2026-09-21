// anuncia_sin_derivar (reglas) — nunca se anuncia un pase sin ejecutarlo (principio 7): el
// cliente quedaría esperando a alguien que nunca se enteró. Si Lucía dice que le pasa la
// consulta al equipo y no llamó a derivar_a_persona, el código ejecuta la derivación; como
// después nadie lee la respuesta, también se sacan las preguntas.
//
// Hallazgo de logica probando en vivo, 20/9: variantes MÁS SUAVES de lo mismo —"te puede
// orientar el equipo del local" en vez de "te paso con alguien"— no estaban en esta lista, así
// que el modelo las decía y quedaban como un pase silencioso: ni derivación registrada (nadie en
// Atención humana se entera) ni la ayuda que sí podía dar (el link, en el caso que lo encontró).
// Es "lo peor de los dos mundos" (logica, 20/9). Estas frases capturan el mismo patrón con otras
// palabras. Cuidado al sumar más: "eso te lo confirma el equipo del local" (AGENTE.md, LO QUE
// NUNCA HACÉS) es la forma APROBADA de no contar cómo funciona por dentro y NO tiene que
// disparar esto — por eso las frases de acá apuntan al verbo de derivar/orientar, no a
// "el equipo del local" a secas.

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
  "te puede orientar",
  "te puede ayudar mejor",
  "te puede asesorar",
  "lo ve la persona que corresponde",
  "lo ve otra persona",
  "eso lo ve el equipo",
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
