// Horarios bloqueados de la agenda (0067, pedido de la dueña 26/9): una fecha, de tal a tal hora
// (hora del local), para todos los probadores o para uno solo — la reunión con un proveedor, el
// probador 2 con el espejo roto toda la tarde. Es el hermano chico de los cierres (cierres.ts):
// aquel cierra el día entero y es solo de la dueña; esto tapa un rato y lo hace también el equipo.
//
// Quién puede qué lo decide la BASE, no este archivo (triggers de 0067, con raise): el equipo
// bloquea mientras el día siga teniendo lugar para un turno (si no, 42501
// 'bloqueo_dia_completo_solo_duena'), y lo que puso la dueña solo lo toca un admin (42501
// 'bloqueo_de_la_duena'). Así vale igual para quien pegue directo a PostgREST con su token. Por
// eso acá nunca se manda creado_por, creado_por_admin ni editado_por: los fija la base mirando la
// sesión, diga lo que diga el request.
//
// Los turnos que ya estaban en el rato que se bloquea NO se cancelan (decisión de la dueña): si
// hay turnos activos ahí, crearBloqueo() no escribe nada y devuelve cuáles son, para que el panel
// avise antes de guardar; quien llama decide si insiste con `confirmar: true`. Mismo molde que
// crearCierre(), pero con la lista y no solo cuántos: un rato es chico y hay que saber a quién
// llamar.
import 'server-only';
import type { Sesion } from '@/lib/api/sesion';
import { hora, sumarDias } from '@/lib/formato';
import { ESTADOS_LIBERAN, nombreDe, type ClienteDb } from './comun';

// Mismo offset fijo que turno-alta.ts y cierres.ts (Argentina no usa horario de verano): si
// NEGOCIO_TZ cambiara a una zona con DST, este valor dejaría de alcanzar en los tres por igual.
const OFFSET_NEGOCIO = '-03:00';

/** Un bloqueo tal como lo muestra la agenda de un día (AgendaDelDia.bloqueos). */
export type BloqueoDelDia = {
  id: string;
  /** 'HH:MM', hora del local. El rato es [desde, hasta): uno que termina a las 16:00 no pisa un turno de las 16:00. */
  desde: string;
  /** 'HH:MM', hora del local; puede ser '24:00' (hasta el final del día). */
  hasta: string;
  /** null = todos los probadores. */
  probador: number | null;
  motivo: string | null;
  /** Lo puso la dueña (creado_por_admin): solo un admin lo cambia o lo borra. */
  de_la_duena: boolean;
  version: number;
};

/** Un bloqueo suelto, con su fecha ('YYYY-MM-DD'): lo que devuelven el alta y el borrado. */
export type Bloqueo = BloqueoDelDia & { fecha: string };

/** Un turno activo que queda debajo del bloqueo que se quiere crear (no se toca, se avisa). */
export type TurnoAfectado = {
  id: string;
  /** 'HH:MM', hora del local. */
  desde: string;
  hasta: string;
  probador: number;
  /** Nombre del cliente, o su teléfono legible si no tiene nombre. */
  cliente: string;
};

const COLUMNAS = 'id, fecha, desde, hasta, probador, motivo, creado_por_admin, version';

type FilaBloqueo = {
  id: string;
  fecha: string;
  desde: string;
  hasta: string;
  probador: number | null;
  motivo: string | null;
  creado_por_admin: boolean;
  version: number;
};

// La columna time llega como 'HH:MM:SS' (y el final del día como '24:00:00'); la fecha, como
// 'YYYY-MM-DD'. Ninguna de las dos pasa por Date: el huso del servidor (UTC) correría el día.
const hhmm = (t: string) => t.slice(0, 5);

function aBloqueo(f: FilaBloqueo): Bloqueo {
  return {
    id: f.id,
    fecha: f.fecha,
    desde: hhmm(f.desde),
    hasta: hhmm(f.hasta),
    probador: f.probador,
    motivo: f.motivo,
    de_la_duena: f.creado_por_admin,
    version: f.version,
  };
}

/** Sin la fecha: para la agenda de un día, donde ya se sabe cuál es. */
export function aBloqueoDelDia(b: Bloqueo): BloqueoDelDia {
  return { id: b.id, desde: b.desde, hasta: b.hasta, probador: b.probador, motivo: b.motivo, de_la_duena: b.de_la_duena, version: b.version };
}

// Fecha + hora del local → instante, para comparar contra turnos.inicio/fin (timestamptz). '24:00'
// es el 00:00 del día siguiente: se arma así y no como 'T24:00', que no todos los parsers aceptan.
function instante(fecha: string, hm: string): string {
  if (hm === '24:00') return `${sumarDias(fecha, 1)}T00:00:00${OFFSET_NEGOCIO}`;
  return `${fecha}T${hm}:00${OFFSET_NEGOCIO}`;
}

// PGRST205 (PostgREST nuevo) o 42P01 (Postgres): la tabla todavía no existe. 0067 la aplica Mateo
// a mano, y el panel puede salir antes: sin esto, la agenda ENTERA (día, semana y mes) daba 500 por
// una tabla que todavía no tiene nada que mostrar.
export function faltaLaTabla(e: { code?: string } | null | undefined): boolean {
  return e?.code === 'PGRST205' || e?.code === '42P01';
}

/**
 * Bloqueos entre dos fechas 'YYYY-MM-DD', ambas inclusive, ordenados por fecha, hora y probador
 * (primero los de todos). Recibe el cliente y no la sesión: lo usa también turnosDelDia().
 */
export async function listarBloqueos(db: ClienteDb, desde: string, hasta: string): Promise<Bloqueo[]> {
  const { data, error } = await db
    .from('bloqueos_agenda')
    .select(COLUMNAS)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('desde')
    .order('probador', { ascending: true, nullsFirst: true })
    .order('id');
  if (error) {
    if (faltaLaTabla(error)) return [];
    throw error;
  }
  return (data ?? []).map(aBloqueo);
}

export type PedidoBloqueo = {
  fecha: string;
  /** 'HH:MM' */
  desde: string;
  /** 'HH:MM' (o '24:00') */
  hasta: string;
  probador: number | null;
  motivo: string | null;
  confirmar: boolean;
};

export type ResultadoCrearBloqueo = { ok: true; bloqueo: Bloqueo } | { ok: false; turnos_afectados: TurnoAfectado[] };

/** Turnos activos que se pisan con [fecha desde, fecha hasta); si el bloqueo es de un probador, solo los suyos. */
export async function turnosBajoElBloqueo(
  db: ClienteDb,
  b: Pick<PedidoBloqueo, 'fecha' | 'desde' | 'hasta' | 'probador'>
): Promise<TurnoAfectado[]> {
  // Se pisan si el turno empieza antes de que termine el bloqueo y termina después de que empieza
  // (rangos semiabiertos, igual que el && de tsrange en la guardia de la base).
  let q = db
    .from('turnos')
    .select('id, probador, inicio, fin, clientes(nombre, telefono)')
    .not('estado', 'in', ESTADOS_LIBERAN)
    .lt('inicio', instante(b.fecha, b.hasta))
    .gt('fin', instante(b.fecha, b.desde))
    .order('inicio', { ascending: true })
    .order('probador', { ascending: true });
  if (b.probador !== null) q = q.eq('probador', b.probador);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    desde: hora(t.inicio),
    hasta: hora(t.fin),
    probador: t.probador,
    cliente: nombreDe(t.clientes),
  }));
}

export async function crearBloqueo(sesion: Sesion, p: PedidoBloqueo): Promise<ResultadoCrearBloqueo> {
  if (!p.confirmar) {
    const afectados = await turnosBajoElBloqueo(sesion.supabase, p);
    if (afectados.length) return { ok: false, turnos_afectados: afectados };
  }

  // Con la sesión, no con service role: la RLS y los triggers de 0067 son los que deciden si este
  // usuario puede (y marcan si el bloqueo es de la dueña).
  const { data, error } = await sesion.supabase
    .from('bloqueos_agenda')
    .insert({ fecha: p.fecha, desde: p.desde, hasta: p.hasta, probador: p.probador, motivo: p.motivo })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return { ok: true, bloqueo: aBloqueo(data) };
}

/** Desbloquear. null = no existe (o ya lo borró otro). Si es de la dueña y no sos admin, la base tira 42501. */
export async function borrarBloqueo(sesion: Sesion, id: string): Promise<Bloqueo | null> {
  const { data, error } = await sesion.supabase.from('bloqueos_agenda').delete().eq('id', id).select(COLUMNAS).maybeSingle();
  if (error) throw error;
  return data ? aBloqueo(data) : null;
}
