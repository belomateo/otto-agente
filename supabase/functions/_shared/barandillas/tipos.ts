// Tipos de las barandillas (AGENTE.md § 6, hito 1.5). Una barandilla mira el texto que Lucía le
// quiere mandar al cliente y la traza del turno (qué herramientas llamó y qué le devolvieron),
// y dice si salta, qué hace el código y por qué (el motivo va a la bitácora). Todas son código.

import type { Traza } from "../traza.ts";

export type Etapa = "formato" | "contenido" | "reglas";

// Qué hace el código cuando salta (la columna "Qué hace" de AGENTE.md § 6).
export type Accion =
  | "limpiar" // se arregla el texto en código y sale
  | "cortar" // se saca el cierre de relleno y sale
  | "quitar_pregunta" // se saca la pregunta y sale
  | "rehacer" // el modelo tiene que escribirlo de nuevo
  | "ejecutar_derivacion" // Lucía anunció un pase: el código lo ejecuta
  | "bloquear"; // fuera de la ventana de Meta: texto libre no, solo plantilla

export type EntradaBarandilla = {
  texto: string;
  traza: Traza;
  ahora: Date;
  ultimoMensajeClienteAt: Date | null;
  esPrimerMensaje: boolean;
  // La intención que dio el clasificador en este turno (paso 4b), si corrió y contestó. Es lo
  // único de acá que no sale del texto ni de la traza de herramientas: venta_sin_resolver.ts la
  // necesita para una barandilla ESTRUCTURAL (mira si se resolvió, no cómo se dijo — pedido de
  // logica, 20/9, después de que el léxico de anuncia_sin_derivar se volviera un juego del
  // gato y el ratón). null si el clasificador no corrió o no contestó.
  intencion?: string | null;
};

export type ResultadoBarandilla =
  | { salta: false }
  | { salta: true; accion: Accion; motivo: string; texto?: string };

export interface Barandilla {
  nombre: string;
  etapa: Etapa;
  accion: Accion;
  evaluar(e: EntradaBarandilla): ResultadoBarandilla | Promise<ResultadoBarandilla>;
}

export const NO_SALTA: ResultadoBarandilla = { salta: false };
