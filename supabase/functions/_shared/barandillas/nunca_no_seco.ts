// Control nunca_no_seco (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que nunca conteste un «no» seco ni niegue disponibilidad sin dar una alternativa.
// Junta: disponibilidad_negada, no_a_secas (en chequeos/, cada uno con su historia).

import { disponibilidadNegada } from "./chequeos/disponibilidad_negada.ts";
import { noASecas } from "./chequeos/no_a_secas.ts";
import type { Control } from "./tipos.ts";

export const nuncaNoSeco: Control = {
  nombre: "nunca_no_seco",
  descripcion: "Que nunca conteste un «no» seco ni niegue disponibilidad sin dar una alternativa.",
  chequeos: [disponibilidadNegada, noASecas],
};
