// Fechas y horas en la zona del negocio (NEGOCIO_TZ). Todo cálculo de fechas es código
// (AGENTE.md § 2): el modelo nunca suma días, ni convierte husos, ni adivina qué día cae.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const MS_POR_MINUTO = 60 * 1000;
export const MINUTOS_POR_HORA = 60;

export type PartesLocales = { anio: number; mes: number; dia: number; hora: number; minuto: number; diaSemana: number };

const formateadores = new Map<string, Intl.DateTimeFormat>();
function formateador(tz: string): Intl.DateTimeFormat {
  let f = formateadores.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    });
    formateadores.set(tz, f);
  }
  return f;
}

const NUMERO_DE_DIA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function partesLocales(fecha: Date, tz: string): PartesLocales {
  const p: Record<string, string> = {};
  for (const x of formateador(tz).formatToParts(fecha)) p[x.type] = x.value;
  return {
    anio: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour) % 24, minuto: Number(p.minute), diaSemana: NUMERO_DE_DIA[p.weekday],
  };
}

const dos = (n: number) => String(n).padStart(2, "0");

export function fechaLocal(fecha: Date, tz: string): string {
  const p = partesLocales(fecha, tz);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

export function horaLocal(fecha: Date, tz: string): string {
  const p = partesLocales(fecha, tz);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

export function minutosDelDia(fecha: Date, tz: string): number {
  const p = partesLocales(fecha, tz);
  return p.hora * MINUTOS_POR_HORA + p.minuto;
}

// Diferencia de la zona con UTC en ese instante, en minutos (Argentina: -180).
export function desfaseMinutos(fecha: Date, tz: string): number {
  const p = partesLocales(fecha, tz);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto);
  const alMinuto = Math.floor(fecha.getTime() / MS_POR_MINUTO) * MS_POR_MINUTO;
  return Math.round((comoUtc - alMinuto) / MS_POR_MINUTO);
}

// "2030-06-06" + "11:00" en la zona del negocio → instante.
export function instanteLocal(fechaYmd: string, horaHm: string, tz: string): Date {
  const [a, m, d] = fechaYmd.split("-").map(Number);
  const [h, mi] = horaHm.split(":").map(Number);
  const supuesto = Date.UTC(a, m - 1, d, h, mi);
  let t = supuesto - desfaseMinutos(new Date(supuesto), tz) * MS_POR_MINUTO;
  t = supuesto - desfaseMinutos(new Date(t), tz) * MS_POR_MINUTO; // por si cae en un cambio de hora
  return new Date(t);
}

// "2030-06-06T11:00:00-03:00": lo que ve el modelo y lo que tiene que devolver tal cual.
export function isoLocal(fecha: Date, tz: string): string {
  const off = desfaseMinutos(fecha, tz);
  const signo = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const hh = dos(Math.floor(abs / MINUTOS_POR_HORA));
  const mm = dos(abs % MINUTOS_POR_HORA);
  return `${fechaLocal(fecha, tz)}T${horaLocal(fecha, tz)}:00${signo}${hh}:${mm}`;
}

// "jueves 6 de junio"
export function fechaLarga(fecha: Date, tz: string): string {
  const p = partesLocales(fecha, tz);
  return `${DIAS[p.diaSemana]} ${p.dia} de ${MESES[p.mes - 1]}`;
}

export function nombreDia(diaSemana: number): string {
  return DIAS[diaSemana];
}

export function esFechaValida(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [a, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// ISO 8601 con fecha, hora y zona explícita (Z o ±hh:mm). Sin zona no se acepta: sería una
// hora ambigua y el turno podría quedar corrido.
export function esFechaHoraValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(iso)) return false;
  return esFechaValida(iso.slice(0, 10)) && !Number.isNaN(new Date(iso).getTime());
}

export function sumarDias(fechaYmd: string, dias: number): string {
  const [a, m, d] = fechaYmd.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

export function diasEntre(desdeYmd: string, hastaYmd: string): number {
  const [a1, m1, d1] = desdeYmd.split("-").map(Number);
  const [a2, m2, d2] = hastaYmd.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / (24 * MINUTOS_POR_HORA * MS_POR_MINUTO));
}
