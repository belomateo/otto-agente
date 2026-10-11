// Control pase_coherente (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que lo que Lucía dice coincida con lo que hizo. Si anuncia un pase, se ejecuta, y al pasar no deja
// una pregunta que nadie va a leer. Y desde el 10/10 (trabajo 4, el auditor de promesas): si dice que
// agendó, confirmó, movió o canceló un turno, que mandó un link o que anotó un dato, la herramienta
// tiene que haber salido bien en este turno, o tiene que ser algo que ya era verdad en la base.
// Junta: deriva_y_pregunta, anuncia_sin_derivar, promesa_sin_hacer (en chequeos/, cada uno con su historia).

import { derivaYPregunta } from "./chequeos/deriva_y_pregunta.ts";
import { anunciaSinDerivar } from "./chequeos/anuncia_sin_derivar.ts";
import { promesaSinHacer } from "./chequeos/promesa_sin_hacer.ts";
import type { Control } from "./tipos.ts";

export const paseCoherente: Control = {
  nombre: "pase_coherente",
  descripcion: "Que lo que dice coincida con lo que hizo: si anuncia un pase a una persona, se ejecuta (y sin una " +
    "pregunta que nadie va a leer); y si dice que agendó, confirmó, movió o canceló un turno, que mandó un link o " +
    "que anotó un dato, la herramienta salió bien en este turno.",
  chequeos: [derivaYPregunta, anunciaSinDerivar, promesaSinHacer],
};
