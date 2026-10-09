// El schema JSON estricto de STACK.md § 3 que devuelve el extractor (el del clasificador se fue
// con él, 9/10). Los enums salen de enums.ts y de ficha.ts: un solo lugar los define.

import { DIA_O_NOCHE, EVENTOS, ROLES_CLIENTE } from "../enums.ts";
import { CAMPOS_FICHA, type Ficha } from "../herramientas/ficha.ts";

// AGENTE.md § 7: la ficha del cliente, todos los campos opcionales (el extractor solo escribe
// lo que el cliente dijo de verdad). Mismos enums que guardar_datos_cliente.
export const ESQUEMA_FICHA = {
  type: "object",
  properties: {
    nombre: { type: ["string", "null"] },
    evento: { type: ["string", "null"], enum: [...EVENTOS, null] },
    fecha_evento: { type: ["string", "null"], description: "AAAA-MM-DD si se puede saber la fecha exacta; si no, null." },
    rol: { type: ["string", "null"], enum: [...ROLES_CLIENTE, null] },
    dia_o_noche: { type: ["string", "null"], enum: [...DIA_O_NOCHE, null] },
    talle_aprox: { type: ["string", "null"] },
    ciudad: { type: ["string", "null"] },
    color_preferido: { type: ["string", "null"] },
    presupuesto_mencionado: { type: ["string", "null"] },
    email: { type: ["string", "null"], description: "Mail que dio el cliente, como lo escribió; si no lo dio, null." },
  },
  required: [...CAMPOS_FICHA],
  additionalProperties: false,
} as const;

export type FichaExtraida = Ficha;
