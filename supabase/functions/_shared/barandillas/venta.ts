// Control venta (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que una consulta por comprar un traje termine con el link de la web de venta.
// Junta: venta_sin_resolver (en chequeos/, cada uno con su historia).

import { ventaSinResolver } from "./chequeos/venta_sin_resolver.ts";
import type { Control } from "./tipos.ts";

export const venta: Control = {
  nombre: "venta",
  descripcion: "Que una consulta por comprar un traje termine con el link de la web de venta.",
  chequeos: [ventaSinResolver],
};
