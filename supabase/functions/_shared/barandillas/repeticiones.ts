// Control repeticiones (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que no repita lo que ya llegó: ni la confirmación de un turno que el sistema ya mandó, ni presentarse de nuevo.
// Junta: confirmacion_doble, presentacion_repetida (en chequeos/, cada uno con su historia).

import { confirmacionDoble } from "./chequeos/confirmacion_doble.ts";
import { presentacionRepetida } from "./chequeos/presentacion_repetida.ts";
import type { Control } from "./tipos.ts";

export const repeticiones: Control = {
  nombre: "repeticiones",
  descripcion: "Que no repita lo que ya llegó: ni la confirmación de un turno que el sistema ya mandó, ni presentarse de nuevo.",
  chequeos: [confirmacionDoble, presentacionRepetida],
};
