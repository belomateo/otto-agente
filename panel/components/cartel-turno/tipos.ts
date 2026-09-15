// Forma de una fila de GET /api/turnos/por-avisar (contrato con paneles, H1.16).
// Ver docs/hitos/1.17-cartel-turno.md § Contrato antes de tocar estos campos: el shape
// tiene que coincidir con lo que devuelva paneles el día que exista la ruta real.

export type TurnoPorAvisar = {
  id: string;
  cliente: string;
  telefono: string;
  /** ISO 8601 con huso horario. */
  desde: string;
  /** ISO 8601 con huso horario. */
  hasta: string;
  tipo: string;
  probador: number;
  evento: string;
  fechaEvento: string;
  rol: string;
  talle: string;
  color: string;
  notas: string;
  /** 'cliente' si confirmó por el botón de WhatsApp; null si todavía no. */
  confirmadoPor: 'cliente' | null;
  charlaUrl: string;
  fichaUrl: string;
};

// Tal como llega del servidor (snake_case, ver el contrato del hito).
export type TurnoPorAvisarCrudo = {
  id: string;
  cliente: string;
  telefono: string;
  desde: string;
  hasta: string;
  tipo: string;
  probador: number;
  evento: string;
  fecha_evento: string;
  rol: string;
  talle: string;
  color: string;
  notas: string;
  confirmado_por: 'cliente' | null;
  charla_url: string;
  ficha_url: string;
};

export function desdeCrudo(t: TurnoPorAvisarCrudo): TurnoPorAvisar {
  return {
    id: t.id,
    cliente: t.cliente,
    telefono: t.telefono,
    desde: t.desde,
    hasta: t.hasta,
    tipo: t.tipo,
    probador: t.probador,
    evento: t.evento,
    fechaEvento: t.fecha_evento,
    rol: t.rol,
    talle: t.talle,
    color: t.color,
    notas: t.notas,
    confirmadoPor: t.confirmado_por,
    charlaUrl: t.charla_url,
    fichaUrl: t.ficha_url,
  };
}
