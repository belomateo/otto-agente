// Control ventana_meta (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que no intente mandar texto libre pasadas las 24 hs del último mensaje del cliente: WhatsApp no lo deja.
// Junta: fuera_ventana_meta (en chequeos/, cada uno con su historia).

import { fueraVentanaMeta } from "./chequeos/fuera_ventana_meta.ts";
import type { Control } from "./tipos.ts";

export const ventanaMeta: Control = {
  nombre: "ventana_meta",
  descripcion: "Que no intente mandar texto libre pasadas las 24 hs del último mensaje del cliente: WhatsApp no lo deja.",
  chequeos: [fueraVentanaMeta],
};
