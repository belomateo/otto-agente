// no_a_secas (reglas) — nunca "no" a secas: si algo no se puede, se dice ofreciendo lo que sí
// hay (regla 7, regla de la casa). Primero decide el código:
//  · si el mensaje no arranca con una negativa, no salta (expresiones como «no te preocupes»
//    no cuentan);
//  · si arranca con una negativa, es corto y no ofrece nada, salta sin preguntarle a nadie.
// Solo en el caso dudoso (arranca negando pero es largo u ofrece algo) le pregunta al revisor
// (LLM_CLASIFICADOR, AGENTE.md § 11). Sin revisor, en la duda no salta.

import { contieneFrase, normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

export const REGLA_NO_A_SECAS = "Nunca decir que no a secas: si algo no se puede, se dice ofreciendo lo que sí hay.";

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
  async evaluar({ texto, revisor }) {
    let n = normalizar(texto).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    for (const e of EXPRESIONES_QUE_NO_NIEGAN) if (contieneFrase(n, e)) n = n.replace(e, " ").replace(/\s+/g, " ").trim();
    if (!ARRANCA_NEGANDO.test(n)) return NO_SALTA;
    const palabras = n.split(" ").filter(Boolean).length;
    // Lo negado no ofrece nada: en «no tenemos ese color», «tenemos» no es una alternativa.
    const sinLoNegado = n.replace(/\bno\s+\S+/g, " ");
    if (palabras <= PALABRAS_DE_UN_MENSAJE_CORTO && !OFRECE_ALGO.test(sinLoNegado)) {
      return { salta: true, accion: "rehacer", motivo: "una negativa a secas: decí que no ofreciendo lo que sí hay" };
    }
    if (!revisor) return NO_SALTA;
    const r = await revisor({ regla: REGLA_NO_A_SECAS, texto });
    if (r.ok) return NO_SALTA;
    return { salta: true, accion: "rehacer", motivo: `el revisor ve una negativa a secas: ${r.motivo}` };
  },
};
