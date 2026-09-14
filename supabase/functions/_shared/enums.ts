// Los enums del agente. Cada uno tiene que coincidir en tres lugares: acá (y por lo tanto en
// el schema de las herramientas), en la base (checks) y en el documento que lo define.
// tests/herramientas/enums.test.ts compara las listas y falla si una se corre.

// AGENTE.md § 8 · fragmentos_tema_check (logica, 0024) · índice del prompt.
export const SECCIONES = [
  "que-incluye",
  "como-funciona",
  "reserva-y-garantia",
  "ubicacion-horarios",
  "talles",
  "a-medida",
  "anticipacion",
  "accesorios",
  "objecion-precio",
  "objecion-turno",
  "objecion-competencia",
  "que-no-hacemos",
  "descuentos",
  "novio",
  "graduado",
  "invitado",
] as const;
export type Seccion = typeof SECCIONES[number];

// PROCESOS.md § 4 · derivaciones_motivo_check (logica, 0023 y 0026). evento_inminente: el
// evento es hoy o mañana y lo resuelve una persona (decisión #8 de Mateo, 14/9).
export const MOTIVOS_DERIVACION = [
  "reclamo",
  "prenda_danada",
  "corporativo",
  "turno_urgente_sin_hueco",
  "evento_inminente",
  "descuento",
  "dato_no_encontrado",
  "pide_persona",
  "barandilla_doble",
  "sin_respuesta",
  "timeout",
] as const;
export type MotivoDerivacion = typeof MOTIVOS_DERIVACION[number];

// Con estos motivos no se le manda la despedida al cliente: sigue una persona (PROCESOS.md § 4).
export const MOTIVOS_SIN_MENSAJE: readonly MotivoDerivacion[] = ["reclamo", "descuento"];

// turnos_tipo_check (0004) · duraciones_turno (paneles, 0012).
export const TIPOS_TURNO = ["graduado", "novio", "invitado", "doble", "triple", "prueba_final"] as const;
export type TipoTurno = typeof TIPOS_TURNO[number];

// AGENTE.md § 4 (enviar_link). enlaces no tiene columna de tipo: ver herramientas/enlaces.ts.
export const TIPOS_LINK = ["mapa", "resena", "web"] as const;
export type TipoLink = typeof TIPOS_LINK[number];

// AGENTE.md § 7 · clientes_evento_check, clientes_rol_check, clientes_dia_o_noche_check (0023).
export const EVENTOS = ["casamiento", "graduacion", "fiesta", "laboral", "otro"] as const;
export type Evento = typeof EVENTOS[number];
export const ROLES_CLIENTE = ["novio", "invitado", "graduado", "padre", "otro"] as const;
export const DIA_O_NOCHE = ["dia", "noche"] as const;

// Estados de turno (turnos_estado_check, paneles 0011). Los que liberan el hueco no cuentan
// para el solapamiento (turnos_sin_solapamiento); los activos son los que todavía no pasaron
// por el local: con uno de esos, no se agenda otro encima (se reprograma).
export const ESTADOS_QUE_LIBERAN = ["cancelado", "no-vino"] as const;
export const ESTADOS_TURNO_ACTIVO = ["sin-confirmar", "confirmado"] as const;
export const ESTADO_TURNO_NUEVO = "sin-confirmar";
export const ESTADO_TURNO_CANCELADO = "cancelado";
export const esEstadoActivo = (estado: string) => (ESTADOS_TURNO_ACTIVO as readonly string[]).includes(estado);

// Quién firma lo que escribe Lucía (editado_por, autor de notas).
export const AUTOR_LUCIA = "lucia";
