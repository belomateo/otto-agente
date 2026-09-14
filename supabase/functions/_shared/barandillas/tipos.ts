// Tipos de las barandillas (AGENTE.md § 6, hito 1.5). Una barandilla mira el texto que Lucía le
// quiere mandar al cliente y la traza del turno (qué herramientas llamó y qué le devolvieron),
// y dice si salta, qué hace el código y por qué (el motivo va a la bitácora). Todas son código;
// solo no_a_secas le puede preguntar al revisor (LLM_CLASIFICADOR), y solo en el caso dudoso.

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

// Revisor de salida (AGENTE.md § 11): responde si el texto cumple una regla. En los tests, un doble.
export type Revisor = (p: { regla: string; texto: string }) => Promise<{ ok: boolean; motivo: string }>;

export type EntradaBarandilla = {
  texto: string;
  traza: Traza;
  ahora: Date;
  ultimoMensajeClienteAt: Date | null;
  revisor?: Revisor;
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
