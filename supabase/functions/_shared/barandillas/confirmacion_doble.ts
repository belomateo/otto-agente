// confirmacion_doble (formato) — hallazgo de Mateo probando en vivo con el worker real (H2.1,
// 15/9): al agendar o reprogramar, el cliente recibía DOS confirmaciones — la que escribe el
// modelo en su propio texto ("¡Listo, Lucas! Te reservé...") y la que arma agendar_turno /
// reprogramar_turno en código (fecha, hora, dirección, mapa y condiciones, AGENTE.md § 4), que
// sale aparte, en un mensaje propio. La de código ya alcanza (y es la que Mateo puede editar de
// verdad); la del modelo es puro texto redundante, no una falla de contenido que valga la pena
// "rehacer" — se descarta directo, entero, apenas agendar_turno o reprogramar_turno salió bien en
// este turno. El prompt ya decía "no la repitas ni la reescribas" (regla 9): no alcanzaba, mismo
// patrón que accesorio_sin_herramienta y presentacion_repetida con un modelo económico — hace
// falta la guarda en código.

import { llamoA } from "../traza.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const HERRAMIENTAS_CON_CONFIRMACION_PROPIA = ["agendar_turno", "reprogramar_turno"];

export const confirmacionDoble: Barandilla = {
  nombre: "confirmacion_doble",
  etapa: "formato",
  accion: "cortar",
  evaluar({ texto, traza }) {
    if (!texto) return NO_SALTA;
    const cual = HERRAMIENTAS_CON_CONFIRMACION_PROPIA.find((h) => llamoA(traza, h));
    if (!cual) return NO_SALTA;
    return {
      salta: true,
      accion: "cortar",
      motivo: `${cual} ya armó su propia confirmación en código: se descarta el texto del modelo para no mandar dos`,
      texto: "",
    };
  },
};
