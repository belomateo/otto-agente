// Etiquetas y colores con los que las consultas llenan la forma de los mocks de front
// (lib/mock-data.ts y components/ui-otto/BloqueTurno.tsx). Están en un solo lugar para que,
// si front cambia un color, se cambie acá y no en cada consulta. Los hex son los mismos
// que ya usan los mocks.

export const ETIQUETA_EVENTO: Record<string, string> = {
  casamiento: 'Casamiento',
  graduacion: 'Graduación',
  fiesta: 'Fiesta',
  laboral: 'Evento laboral',
  otro: 'Otro',
};

export const ETIQUETA_ROL: Record<string, string> = {
  novio: 'Novio',
  invitado: 'Invitado',
  graduado: 'Graduado',
  padre: 'Padre o madre',
  otro: 'Otro',
};

export const ETIQUETA_DIA_O_NOCHE: Record<string, string> = { dia: 'Día', noche: 'Noche' };

export const ETIQUETA_TIPO_TURNO: Record<string, string> = {
  graduado: 'Graduado',
  novio: 'Novio',
  invitado: 'Invitado',
  doble: 'Doble',
  triple: 'Triple',
  prueba_final: 'Prueba final',
};

/** Estado del turno → etiqueta y colores (borde del bloque, fondo y letra del chip). */
export const ESTILO_ESTADO_TURNO: Record<string, { etiqueta: string; borde: string; eb: string; ef: string }> = {
  'sin-confirmar': { etiqueta: 'Sin confirmar', borde: '#B8862B', eb: '#F7EFDD', ef: '#B8862B' },
  confirmado: { etiqueta: 'Confirmado', borde: '#5E7F62', eb: '#E7EFE7', ef: '#5E7F62' },
  alquilo: { etiqueta: 'Alquiló', borde: '#A8703F', eb: '#F1E6D9', ef: '#A8703F' },
  retiro: { etiqueta: 'Retiró', borde: '#1F2A3C', eb: '#EEF1F5', ef: '#1F2A3C' },
  devolvio: { etiqueta: 'Devolvió', borde: '#C9C4B9', eb: '#EFEDE8', ef: '#5C6068' },
  cancelado: { etiqueta: 'Cancelado', borde: '#A6473A', eb: '#F6E3DF', ef: '#A6473A' },
  'no-vino': { etiqueta: 'No vino', borde: '#C9C4B9', eb: '#EFEDE8', ef: '#5C6068' },
};

/** Motivo de derivación (PROCESOS.md § 4) → etiqueta y colores de la tarjeta de Atención humana. */
export const ESTILO_MOTIVO: Record<string, { etiqueta: string; cb: string; cf: string; urgente: boolean }> = {
  turno_urgente_sin_hueco: { etiqueta: 'Turno urgente', cb: '#F6E3DF', cf: '#A6473A', urgente: true },
  reclamo: { etiqueta: 'Reclamo', cb: '#F6E3DF', cf: '#A6473A', urgente: true },
  prenda_danada: { etiqueta: 'Prenda dañada', cb: '#F6E3DF', cf: '#A6473A', urgente: true },
  corporativo: { etiqueta: 'Corporativo', cb: '#EEF1F5', cf: '#1F2A3C', urgente: false },
  descuento: { etiqueta: 'Descuento', cb: '#F1E6D9', cf: '#A8703F', urgente: false },
  dato_no_encontrado: { etiqueta: 'Dato no encontrado', cb: '#EEF1F5', cf: '#1F2A3C', urgente: false },
  pide_persona: { etiqueta: 'Pide una persona', cb: '#EEF1F5', cf: '#1F2A3C', urgente: false },
  barandilla_doble: { etiqueta: 'Barandilla', cb: '#F7EFDD', cf: '#B8862B', urgente: false },
  sin_respuesta: { etiqueta: 'Sin respuesta', cb: '#F7EFDD', cf: '#B8862B', urgente: false },
  timeout: { etiqueta: 'Demora', cb: '#F7EFDD', cf: '#B8862B', urgente: false },
};
export const BORDE_DERIVACION = { urgente: '#A8703F', normal: '#E6E1D8' };

/** Quién tiene la charla → chip de la Bandeja. */
export const CHIP_CONVERSACION: Record<string, { chip: 'Lucía' | 'Persona' | 'Cerrada'; cb: string; cf: string }> = {
  activa: { chip: 'Lucía', cb: '#EEF1F5', cf: '#1F2A3C' },
  derivada: { chip: 'Persona', cb: '#F1E6D9', cf: '#A8703F' },
  cerrada: { chip: 'Cerrada', cb: '#EFEDE8', cf: '#5C6068' },
};

/** Tipo de evento de la bitácora → etiqueta y tono de la fila (Bitácora). */
export const ESTILO_EVENTO: Record<string, { etiqueta: string; tone: string; bg: string }> = {
  ok: { etiqueta: 'Mensaje', tone: '#5C6068', bg: 'transparent' },
  pensamiento: { etiqueta: 'Pensamiento', tone: '#5C6068', bg: 'transparent' },
  herramienta: { etiqueta: 'Herramienta', tone: '#5C6068', bg: 'transparent' },
  error: { etiqueta: 'Error', tone: '#A6473A', bg: '#F6E3DF' },
  derivacion: { etiqueta: 'Derivación', tone: '#A6473A', bg: '#F6E3DF' },
  barandilla: { etiqueta: 'Barandilla', tone: '#B8862B', bg: '#F7EFDD' },
};

/** Temas de la base de conocimiento (AGENTE.md § 8), en el orden en que se muestran. */
export const ETIQUETA_TEMA: Record<string, string> = {
  'que-incluye': 'Qué incluye el alquiler',
  'como-funciona': 'Cómo funciona: retiro y devolución',
  'reserva-y-garantia': 'Reserva y garantía',
  'ubicacion-horarios': 'Ubicación y horarios',
  talles: 'Talles',
  'a-medida': 'A medida',
  anticipacion: 'Anticipación',
  accesorios: 'Accesorios',
  'objecion-precio': 'Objeción: es caro',
  'objecion-turno': 'Objeción: lo voy a pensar',
  'objecion-competencia': 'Objeción: la competencia',
  'que-no-hacemos': 'Qué no hacemos',
  descuentos: 'Descuentos',
  novio: 'Guion: novio',
  graduado: 'Guion: graduado',
  invitado: 'Guion: invitado',
};
