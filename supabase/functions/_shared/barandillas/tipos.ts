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
  // Lo que escribió el cliente en esta ráfaga. venta_sin_resolver.ts lo lee para saber si pidió
  // comprar un traje: hasta el 9/10 se lo decía el clasificador (intencion "venta"), que se sacó.
  mensajeCliente?: string | null;
  // El nombre del cliente (ficha.nombre, de la libreta al empezar el turno). precio_sin_
  // herramienta.ts lo necesita para no leer como precio un número que viene del NOMBRE DE
  // PERFIL de WhatsApp ("Martin 23", hallazgo de logica probando en vivo, 20/9: sin esto, ese
  // cliente queda en un bucle garantizado de barandilla_doble en su primer mensaje, porque
  // Lucía no puede saludarlo sin repetir el número que la barandilla le pide sacar).
  nombreCliente?: string | null;
  // Cuántas veces ya se rehízo este turno (0 en el primer intento). precio_sin_herramienta.ts lo
  // usa para un total sumado: la primera vez lo reescribe el modelo; si vuelve a sumar, el total se
  // saca en código en vez de derivar (8/10).
  saltosPrevios?: number;
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

// Un control (pedido de Mateo, 9/10: 7 en vez de 16 barandillas sueltas) junta las revisiones que
// cuidan lo mismo. Cada revisión —un chequeo— es una Barandilla de las de antes, en chequeos/, y
// sigue corriendo igual y en el mismo orden de siempre (CHEQUEOS_EN_ORDEN, en index.ts).
export interface Control {
  nombre: string;
  descripcion: string;
  chequeos: readonly Barandilla[];
}
