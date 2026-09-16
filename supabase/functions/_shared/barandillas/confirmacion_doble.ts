// confirmacion_doble (formato) — hallazgo de Mateo probando en vivo con el worker real (H2.1,
// 15/9): al agendar o reprogramar, el cliente recibía DOS confirmaciones — la que escribe el
// modelo en su propio texto ("¡Listo, Lucas! Te reservé...") y la que arma agendar_turno /
// reprogramar_turno en código (fecha, hora, dirección, mapa y condiciones, AGENTE.md § 4), que
// sale aparte, en un mensaje propio. La de código ya alcanza (y es la que Mateo puede editar de
// verdad); la del modelo es puro texto redundante, no una falla de contenido que valga la pena
// "rehacer" — se descarta apenas agendar_turno o reprogramar_turno salió bien en este turno. El
// prompt ya decía "no la repitas ni la reescribas" (regla 9): no alcanzaba, mismo patrón que
// accesorio_sin_herramienta y presentacion_repetida con un modelo económico — hace falta la
// guarda en código.
//
// Hallazgo de Mateo, 16/9: descartaba el texto ENTERO, no solo la frase repetida. Si el cliente
// preguntó otra cosa en el mismo mensaje ("dale, agendame ese, ¿y alquilan corbata tambien?"),
// esa respuesta se perdía con la confirmación. Ahora, igual que presentacion_repetida, se recorta
// SOLO la o las oraciones que son la confirmación repetida y se deja el resto tal cual.

import { llamoA } from "../traza.ts";
import { contieneFrase, normalizar, oraciones, rearmar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const HERRAMIENTAS_CON_CONFIRMACION_PROPIA = ["agendar_turno", "reprogramar_turno", "confirmar_turno"];

// "Te reservé/agendé/reprogramé/confirmé el turno...", "Tu turno quedó agendado...": mismo
// vocabulario que usa la confirmación de código (AGENTE.md § 4), así que si el modelo escribe
// algo parecido justo en el turno en que ya se armó una, es la misma frase, no información nueva.
function esConfirmacionDeReserva(oracion: string): boolean {
  const n = normalizar(oracion);
  return contieneFrase(n, "turno") && /\b(agend|reserv|confirm|anot|qued|reprogram)/.test(n);
}

// Un saludo corto pegado justo antes de la confirmación ("¡Listo, Lucas!", "¡Perfecto!") es
// parte de ella, no una frase con contenido propio — se saca junto, nunca solo (si no hay una
// confirmación justo después, no se toca: podría ser el arranque de otra cosa).
function esSaludoDeApertura(oracion: string): boolean {
  const n = normalizar(oracion).replace(/^[¡!¿?\s]+/, "");
  return n.length <= 40 && /^(listo|perfecto|genial|excelente|dale)\b/.test(n);
}

export const confirmacionDoble: Barandilla = {
  nombre: "confirmacion_doble",
  etapa: "formato",
  accion: "cortar",
  evaluar({ texto, traza }) {
    if (!texto) return NO_SALTA;
    const cual = HERRAMIENTAS_CON_CONFIRMACION_PROPIA.find((h) => llamoA(traza, h));
    if (!cual) return NO_SALTA;
    const os = oraciones(texto);
    const esConfirmacion = os.map((o) => esConfirmacionDeReserva(o.texto));
    const aSacar = os.map((o, i) => esConfirmacion[i] || (esSaludoDeApertura(o.texto) && esConfirmacion[i + 1] === true));
    if (!aSacar.some(Boolean)) return NO_SALTA;
    const cortadas = os.filter((_, i) => aSacar[i]).map((o) => o.texto).join(" ");
    return {
      salta: true,
      accion: "cortar",
      motivo: `${cual} ya armó su propia confirmación en código: se recorta la frase repetida del modelo («${cortadas}») y se deja el resto`,
      texto: rearmar(os.filter((_, i) => !aSacar[i])),
    };
  },
};
