// Formas de fila que vienen del canvas de Claude Design (Fase 1, H1.2) y que las consultas
// reales de paneles (panel/lib/queries/**) siguen devolviendo tal cual, así los componentes de
// front no cambian de forma al pasar de datos de ejemplo a datos reales. Los datos de ejemplo
// que vivían acá (convos, derivas, turnosM, clientes, catalogo, accesorios, fragmentos, eventos,
// reglas, kpis) se borraron el 16/9: ninguna pantalla los usa ya (Bitácora y Configuración,
// las últimas, cerraron con datos reales — front-5f4865f y front-8b9d019). Si hace falta un tipo
// nuevo acá, que sea porque una consulta real lo exporta, no para maquetar.

export type Conversacion = {
  n: string;
  m: string;
  h: string;
  chip: 'Lucía' | 'Persona' | 'Cerrada';
  cb: string;
  cf: string;
  bg: string;
  tag: string;
  hasTag: boolean;
};

export type Derivacion = {
  n: string;
  hace: string;
  motivo: string;
  cb: string;
  cf: string;
  borde: string;
  resumen: string;
};

export type TurnoDelDia = {
  h: string;
  n: string;
  t: string;
  p: string;
  e: string;
  eb: string;
  ef: string;
  borde: string;
};

export type Cliente = {
  n: string;
  tel: string;
  ev: string;
  f: string;
  rol: string;
  ult: string;
  turno: string;
};

export type ModeloCatalogo = {
  n: string;
  p: string;
  talles: string;
  foto: string;
  dots: string[];
  on: boolean;
  off: boolean;
};

export type EventoBitacora = {
  h: string;
  tipo: string;
  n: string;
  d: string;
  tone: string;
  bg: string;
};
