// Cierres puntuales de agenda (0061, pedido de Mateo 21/9): además del horario semanal
// (horarios/franjas_turnos), una fecha concreta puede quedar sin turnos — feriado, cierre
// excepcional. Es dato de agenda, no un interruptor: Lucía sigue atendiendo esos días, solo que
// no ofrece huecos para agendar.
//
// Cerrar una fecha que YA tiene turnos no los cancela sola (decisión de Mateo, pendiente de
// consultarle caso por caso vía logica): si hay turnos activos ese día, crearCierre() no
// escribe nada y devuelve cuántos hay, para que el panel avise antes de guardar; el llamador
// decide si insiste con `confirmar: true`.
import 'server-only';
import type { Sesion } from '@/lib/api/sesion';
import { ESTADOS_LIBERAN } from './comun';

// Mismo offset fijo que turno-alta.ts (Argentina no usa horario de verano): si NEGOCIO_TZ
// cambiara a una zona con DST, este valor dejaría de alcanzar en los dos lugares por igual.
const OFFSET_NEGOCIO = '-03:00';

export type Cierre = { fecha: string; motivo: string | null; creado_por: string | null; creado_at: string };

export async function listarCierres(sesion: Sesion): Promise<Cierre[]> {
  const { data, error } = await sesion.supabase.from('cierres_agenda').select('*').order('fecha');
  if (error) throw error;
  return data ?? [];
}

export type ResultadoCrearCierre = { ok: true; cierre: Cierre } | { ok: false; turnos_afectados: number };

export async function crearCierre(sesion: Sesion, fecha: string, motivo: string | null, confirmar: boolean): Promise<ResultadoCrearCierre> {
  if (!confirmar) {
    const { count, error: eContar } = await sesion.supabase
      .from('turnos')
      .select('id', { count: 'exact', head: true })
      .not('estado', 'in', ESTADOS_LIBERAN)
      .gte('inicio', `${fecha}T00:00:00${OFFSET_NEGOCIO}`)
      .lt('inicio', `${fecha}T23:59:59.999${OFFSET_NEGOCIO}`);
    if (eContar) throw eContar;
    if (count) return { ok: false, turnos_afectados: count };
  }

  const { data, error } = await sesion.supabase
    .from('cierres_agenda')
    .insert({ fecha, motivo, creado_por: sesion.usuario.id })
    .select('*')
    .single();
  if (error) throw error;
  return { ok: true, cierre: data };
}

export async function borrarCierre(sesion: Sesion, fecha: string): Promise<Cierre | null> {
  const { data, error } = await sesion.supabase.from('cierres_agenda').delete().eq('fecha', fecha).select('*').maybeSingle();
  if (error) throw error;
  return data;
}
