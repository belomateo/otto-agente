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

// PROCESOS.md § 4 · derivaciones_motivo_check (logica, 0023, 0026 y 0044). evento_inminente: el
// evento es hoy o mañana y lo resuelve una persona (decisión #8 de Mateo, 14/9). fallo_tecnico
// (0044, logica, 16/9): un trabajo de la cola agotó los 2 intentos, o un mensaje quedó en duda
// (el worker se cortó justo al mandarlo) — no es culpa del cliente ni una decisión de Lucía.
export const MOTIVOS_DERIVACION = [
  "reclamo",
  "cliente_enojado",
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
  "fallo_tecnico",
] as const;
export type MotivoDerivacion = typeof MOTIVOS_DERIVACION[number];

// Con estos motivos no se manda la despedida que ESCRIBE EL MODELO al llamar derivar_a_persona
// (PROCESOS.md § 4): no se discute con alguien caliente, ni se manda una despedida armada que
// capaz suena impostada. Hasta el 18/9 eso significaba mudo del todo; desde el pedido de Mateo
// del 19/9 (toda derivación le deja algo al cliente) significa "la reemplaza un texto fijo
// aprobado" (texto_derivacion_reclamo) en vez de "no se manda nada" — ver derivar_a_persona.ts.
// No confundir con MOTIVOS_QUE_QUEDAN_MUDOS de _shared/turno/turno.ts: esa es la lista corta (solo
// sin_respuesta/timeout) de las dos excepciones que SÍ quedan mudas de verdad, para una pregunta
// parecida pero sobre las derivaciones que decide el código, no el modelo.
export const MOTIVOS_SIN_MENSAJE: readonly MotivoDerivacion[] = ["reclamo", "cliente_enojado", "descuento"];

// Motivos que SOLO decide el código, nunca el modelo llamando a derivar_a_persona (AGENTE.md
// § 2 y § 10: "es derivación dura, la decide código, nunca el LLM"). Hallazgo C2 del tester
// (15/9): nada en el schema de la herramienta se lo impedía — el modelo podía llamar
// derivar_a_persona con motivo evento_inminente por su cuenta, tomando un atajo que se saltea
// buscar_horarios/agendar_turno (donde el código SÍ guarda la fecha del evento) y el texto fijo
// aprobado. evento_inminente lo decide _shared/turno/derivacion_dura.ts o las herramientas de
// agenda (herramientas/derivacion.ts); barandilla_doble y sin_respuesta/timeout los decide
// turno.ts después de que el LLM ya dejó de responder o de que una barandilla volvió a saltar;
// fallo_tecnico (0044, logica) lo decide el procesamiento de cola_trabajos, fuera de un turno
// normal (los 2 intentos de un trabajo se agotaron, o un mensaje quedó en duda al mandarlo): en
// ninguno de los cuatro casos hay "un modelo" al que pedirle que elija ese motivo.
export const MOTIVOS_SOLO_CODIGO: readonly MotivoDerivacion[] = [
  "evento_inminente",
  "barandilla_doble",
  "sin_respuesta",
  "timeout",
  "fallo_tecnico",
];

// El enum real de la herramienta derivar_a_persona: todos los motivos MENOS los que decide
// exclusivamente el código.
export const MOTIVOS_DERIVACION_LLM: readonly MotivoDerivacion[] = MOTIVOS_DERIVACION.filter(
  (m) => !(MOTIVOS_SOLO_CODIGO as readonly string[]).includes(m),
);

// turnos_tipo_check (0004) · duraciones_turno (paneles, 0012).
export const TIPOS_TURNO = ["graduado", "novio", "invitado", "doble", "triple", "prueba_final"] as const;
export type TipoTurno = typeof TIPOS_TURNO[number];

// AGENTE.md § 4 (enviar_link). enlaces no tiene columna de tipo: ver herramientas/enlaces.ts.
// web-venta (pedido de Mateo, 20/9: Lucía deriva de más por venta) es el link de la tienda
// online (mrotto.com.ar), distinto de "web" (la web de alquiler, mrottocollection.com.ar).
export const TIPOS_LINK = ["mapa", "resena", "web", "web-venta"] as const;
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
