// no_a_secas (reglas) — nunca "no" a secas: si algo no se puede, se dice ofreciendo lo que sí
// hay (regla 7, regla de la casa). Todo en código:
//  · si el mensaje no arranca con una negativa, no salta (expresiones como «no te preocupes»
//    no cuentan);
//  · si arranca con una negativa, es corto y no ofrece nada, salta.
//  · si arranca negando pero es largo u ofrece algo (el caso dudoso), no salta: mejor un falso
//    negativo ocasional que frenar mensajes que sí ofrecen algo. Hasta el 17/9 esto le preguntaba
//    a un "revisor" LLM en el caso dudoso, pero nada en turno.ts lo pasaba nunca — la rama nunca
//    corrió en producción (hallazgo de la auditoría, 17/9). Se sacó, junto con el tipo Revisor
//    (barandillas/tipos.ts) y la fila del "Revisor de salida" en AGENTE.md § 11, que documentaban
//    algo que no existía.

import { contieneFrase, normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const EXPRESIONES_QUE_NO_NIEGAN = [
  "no te preocupes",
  "no hay problema",
  "no pasa nada",
  "no hay drama",
  "no dudes",
  "no hace falta",
  "no es necesario",
];
const ARRANCA_NEGANDO = /^(no|nop|nope|lamentablemente|lo siento|disculpa|disculpame|perdon|imposible)\b/;
const OFRECE_ALGO =
  /\b(pero|aunque|si|podes|podemos|tenemos|te ofrezco|te puedo|lo que si|en cambio|te recomiendo|te cuento|opcion|opciones|alternativa|te propongo|te esperamos)\b/;
const PALABRAS_DE_UN_MENSAJE_CORTO = 12;

export const noASecas: Barandilla = {
  nombre: "no_a_secas",
  etapa: "reglas",
  accion: "rehacer",
  evaluar({ texto }) {
    let n = normalizar(texto).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    for (const e of EXPRESIONES_QUE_NO_NIEGAN) if (contieneFrase(n, e)) n = n.replace(e, " ").replace(/\s+/g, " ").trim();
    if (!ARRANCA_NEGANDO.test(n)) return NO_SALTA;
    const palabras = n.split(" ").filter(Boolean).length;
    // Lo negado no ofrece nada: en «no tenemos ese color», «tenemos» no es una alternativa.
    const sinLoNegado = n.replace(/\bno\s+\S+/g, " ");
    if (palabras <= PALABRAS_DE_UN_MENSAJE_CORTO && !OFRECE_ALGO.test(sinLoNegado)) {
      return { salta: true, accion: "rehacer", motivo: "una negativa a secas: decí que no ofreciendo lo que sí hay" };
    }
    return NO_SALTA;
  },
};
