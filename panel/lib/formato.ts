// Fechas, horas y plata para las consultas de las pestañas (H1.8). Todo en la zona del
// negocio: el servidor corre en UTC y un turno de las 10:00 en Rosario no puede aparecer
// como 13:00. Las fechas sin hora ('YYYY-MM-DD', p. ej. clientes.fecha_evento) no pasan
// por zonas: se leen tal cual.

export const ZONA_NEGOCIO = process.env.NEGOCIO_TZ || 'America/Argentina/Cordoba';

function partes(d: Date, opciones: Intl.DateTimeFormatOptions): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, ...opciones }).formatToParts(d)) {
    salida[p.type] = p.value;
  }
  return salida;
}

/** 'YYYY-MM-DD' del instante dado, en la zona del negocio. */
export function fechaEnZona(d: Date = new Date()): string {
  const p = partes(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutos que la zona del negocio está corrida respecto de UTC en ese instante (Argentina: -180). */
function desfaseMinutos(d: Date): number {
  const p = partes(d, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((comoUtc - d.getTime()) / 60000);
}

export function esFecha(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Inicio y fin (ISO en UTC) del día 'YYYY-MM-DD' en la zona del negocio, semiabierto [desde, hasta). */
export function rangoDelDia(fecha: string): { desde: string; hasta: string } {
  const [y, m, d] = fecha.split('-').map(Number);
  // El desfase se mide al mediodía, lejos de un eventual cambio de hora.
  const desfase = desfaseMinutos(new Date(Date.UTC(y, m - 1, d, 12)));
  return {
    desde: new Date(Date.UTC(y, m - 1, d) - desfase * 60000).toISOString(),
    hasta: new Date(Date.UTC(y, m - 1, d + 1) - desfase * 60000).toISOString(),
  };
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 0 = domingo … 6 = sábado, de una fecha 'YYYY-MM-DD' (misma convención que horarios.dia_semana). */
export function diaDeLaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** '10:02' */
export function hora(iso: string): string {
  const p = partes(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

/** '14/11' a partir de 'YYYY-MM-DD'. */
export function diaMes(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${d}/${m}`;
}

/** 'sáb 10:00' */
export function diaYHora(iso: string): string {
  return `${DIAS_CORTOS[diaDeLaSemana(fechaEnZona(new Date(iso)))]} ${hora(iso)}`;
}

/** 'Sábado 12 de septiembre' */
export function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${DIAS_LARGOS[diaDeLaSemana(fecha)]} ${d} de ${MESES[m - 1]}`;
}

/** Bandeja: '10:02' si es de hoy, 'ayer', 'jue' si es de esta semana y, si no, '3/9'. */
export function momentoCorto(iso: string, ahora: Date = new Date()): string {
  const f = fechaEnZona(new Date(iso));
  const hoy = fechaEnZona(ahora);
  if (f === hoy) return hora(iso);
  if (f === sumarDias(hoy, -1)) return 'ayer';
  if (f > sumarDias(hoy, -7)) return DIAS_CORTOS[diaDeLaSemana(f)];
  return diaMes(f);
}

/** Clientes: 'hace 12 min', 'hoy 09:41', 'ayer', 'jue' o '3/9'. */
export function ultimoContacto(iso: string, ahora: Date = new Date()): string {
  const minutos = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60000);
  if (minutos >= 0 && minutos < 60) return minutos <= 1 ? 'recién' : `hace ${minutos} min`;
  if (fechaEnZona(new Date(iso)) === fechaEnZona(ahora)) return `hoy ${hora(iso)}`;
  return momentoCorto(iso, ahora);
}

/** Atención humana: 'hace 12 min', 'hace 2 h', 'hace 3 días'. */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/** Versión de un dato editable: 'v4 · 02/09'. */
export function etiquetaVersion(version: number, editadoAt: string): string {
  const [, m, d] = fechaEnZona(new Date(editadoAt)).split('-');
  return `v${version} · ${d}/${m}`;
}

/** '$150.000' (pesos, sin decimales si no hacen falta). */
export function plata(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
}

/** 'US$ 1,23' — el costo de OpenAI se guarda en dólares (consumo_llm.costo_usd). */
export function dolares(n: number): string {
  return 'US$ ' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
