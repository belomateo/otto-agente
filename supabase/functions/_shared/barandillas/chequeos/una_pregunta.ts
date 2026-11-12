// una_pregunta (formato) — una sola pregunta por mensaje (AGENTE.md § 1 y § 6). Con más de un
// "?" de cierre, el modelo lo rehace. Varios "??" seguidos cuentan como uno.
//
// 12/11: si en el segundo intento vuelve a traer más de una, se sacan en código las preguntas de más y
// queda la última, en vez de pasar la charla. Antes terminaba en barandilla_doble: a «Buen día, ¿cómo va?»
// Lucía contestaba «Todo bien, ¿y vos? … ¿Para qué evento es?», saltaba dos veces y el cliente recibía
// «ya les avisé, en un rato te escriben» (Frann, Tony, Carla, Fede: 7 charlas en una semana, sin respuesta).

import { type Barandilla, NO_SALTA } from "../tipos.ts";

export function contarPreguntas(t: string): number {
  return (String(t ?? "").match(/\?+/g) ?? []).length;
}

// Deja solo la última pregunta del texto: cada pregunta anterior (desde su «¿», o desde el fin de la oración
// anterior si no tiene «¿», hasta su «?») se saca entera.
export function soloLaUltimaPregunta(texto: string): string {
  const cierres = [...texto.matchAll(/\?+/g)];
  let t = texto;
  for (const c of cierres.slice(0, -1).reverse()) {
    const fin = (c.index ?? 0) + c[0].length;
    const antes = t.slice(0, c.index);
    const limite = Math.max(antes.lastIndexOf("."), antes.lastIndexOf("!"), antes.lastIndexOf("?"), antes.lastIndexOf("\n"));
    const apertura = antes.lastIndexOf("¿");
    const inicio = apertura > limite ? apertura : limite + 1;
    let previo = t.slice(0, inicio).replace(/[ \t]+$/, "");
    const resto = t.slice(fin).replace(/^[ \t]+/, "");
    // «Todo bien, ¿y vos? El alquiler…» → «Todo bien. El alquiler…»: la coma que quedaba colgando cierra la oración.
    if (previo.endsWith(",")) previo = previo.slice(0, -1) + (resto === "" || /^[\nA-ZÁÉÍÓÚÑ¡¿]/.test(resto) ? "." : ",");
    t = previo + (previo && resto && !/\n$/.test(previo) && !resto.startsWith("\n") ? " " : "") + resto;
  }
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const unaPregunta: Barandilla = {
  nombre: "una_pregunta",
  etapa: "formato",
  accion: "rehacer",
  evaluar({ texto, saltosPrevios }) {
    const n = contarPreguntas(texto);
    if (n <= 1) return NO_SALTA;
    const motivo = `${n} preguntas en un mensaje: tiene que haber una sola, al final`;
    if (saltosPrevios) {
      return { salta: true, accion: "limpiar", motivo: `${motivo} (segundo intento: se dejó en código solo la última)`, texto: soloLaUltimaPregunta(texto) };
    }
    return { salta: true, accion: "rehacer", motivo };
  },
};
