// Los dos schemas JSON estrictos de STACK.md § 3: lo que devuelven el clasificador y el
// extractor. Los enums salen de enums.ts y de ficha.ts: un solo lugar los define.

import { DIA_O_NOCHE, EVENTOS, ROLES_CLIENTE } from "../enums.ts";
import { CAMPOS_FICHA, type Ficha } from "../herramientas/ficha.ts";

// AGENTE.md § 3 paso 4: { intencion, urgencia, derivar_duro }. motivo_derivacion se agregó acá
// (H1.7, 14/9): sin decir CUÁL de las categorías duras es, el código no puede escribir
// `derivaciones.motivo` sin adivinar. Cubre las que sí se pueden saber ANTES de hablar con
// Lucía; turno_urgente_sin_hueco se descubre recién adentro del turno, cuando buscar_horarios
// no encuentra nada (ver AGENTE.md § 3 y § 10).
export const ESQUEMA_CLASIFICACION = {
  type: "object",
  properties: {
    intencion: { type: "string", enum: ["alquiler", "venta", "corporativo", "reclamo", "urgente", "otro"] },
    urgencia: { type: "string", enum: ["baja", "media", "alta"] },
    derivar_duro: { type: "boolean" },
    motivo_derivacion: { type: ["string", "null"], enum: ["reclamo", "prenda_danada", "corporativo", null] },
  },
  required: ["intencion", "urgencia", "derivar_duro", "motivo_derivacion"],
  additionalProperties: false,
} as const;

export type Clasificacion = {
  intencion: "alquiler" | "venta" | "corporativo" | "reclamo" | "urgente" | "otro";
  urgencia: "baja" | "media" | "alta";
  derivar_duro: boolean;
  motivo_derivacion: "reclamo" | "prenda_danada" | "corporativo" | null;
};

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
