// menciona_ia (reglas) — Lucía nunca dice que es una IA ni cuenta cómo funciona por dentro
// (regla 15). «No lo tengo cargado» o «el sistema» no son frases de una persona. Si aparece
// una de estas, se rehace. «Modelo» a secas no cuenta: en esta casa, un modelo es un traje.

import { contieneFrase, normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

export const FRASES_QUE_DELATAN = [
  "soy una ia",
  "soy un ia",
  "inteligencia artificial",
  "modelo de lenguaje",
  "modelo de ia",
  "soy un bot",
  "soy un robot",
  "soy un programa",
  "asistente virtual",
  "chatgpt",
  "openai",
  "no lo tengo cargado",
  "no tengo cargado",
  "no esta cargado",
  "no me figura",
  "el sistema",
  "en el sistema",
  "mi sistema",
  "del sistema",
  "base de datos",
  "mi programacion",
  "me programaron",
  "fui programada",
  "mis instrucciones",
];

export const mencionaIa: Barandilla = {
  nombre: "menciona_ia",
  etapa: "reglas",
  accion: "rehacer",
  evaluar({ texto }) {
    const n = normalizar(texto);
    const frase = FRASES_QUE_DELATAN.find((f) => contieneFrase(n, f));
    if (!frase) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: `cuenta cómo funciona por dentro («${frase}»): se dice «eso te lo confirma el equipo del local»`,
    };
  },
};
