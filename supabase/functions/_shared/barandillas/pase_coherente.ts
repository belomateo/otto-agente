// Control pase_coherente (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que el pase a una persona sea de verdad: si lo anuncia, se ejecuta; y al pasar, no deja una pregunta que nadie va a leer.
// Junta: deriva_y_pregunta, anuncia_sin_derivar (en chequeos/, cada uno con su historia).

import { derivaYPregunta } from "./chequeos/deriva_y_pregunta.ts";
import { anunciaSinDerivar } from "./chequeos/anuncia_sin_derivar.ts";
import type { Control } from "./tipos.ts";

export const paseCoherente: Control = {
  nombre: "pase_coherente",
  descripcion: "Que el pase a una persona sea de verdad: si lo anuncia, se ejecuta; y al pasar, no deja una pregunta que nadie va a leer.",
  chequeos: [derivaYPregunta, anunciaSinDerivar],
};
