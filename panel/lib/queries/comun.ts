// Piezas que comparten las consultas de las pestañas (H1.8).
import 'server-only';
import type { crearClienteServidor } from '@/lib/supabase/server';
import type { Database } from '@/lib/tipos-db';
import { ETIQUETA_DIA_O_NOCHE, ETIQUETA_EVENTO, ETIQUETA_ROL } from '@/lib/etiquetas';
import { diaMes, diaYHora } from '@/lib/formato';

/** Cliente de Supabase con la sesión del usuario: RLS es el filtro de todo lo que se lee. */
export type ClienteDb = Awaited<ReturnType<typeof crearClienteServidor>>;
export type Fila<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

/** Estados de turno que ya no ocupan la agenda (0011: liberan el hueco). */
export const ESTADOS_LIBERAN = '(cancelado,no-vino)';

/** Minúsculas y sin tildes, para buscar como escribe un cliente. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * '341 615-2233' a partir de lo que manda WhatsApp ('5493416152233'). Es solo para mostrar:
 * asume característica de 3 dígitos salvo el 11; si no puede, devuelve el número tal cual.
 */
export function telefonoLegible(tel: string): string {
  let d = tel.replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.length !== 10) return tel;
  return d.startsWith('11') ? `11 ${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function nombreDe(c: { nombre: string | null; telefono: string } | null | undefined): string {
  if (!c) return '—';
  return c.nombre?.trim() || telefonoLegible(c.telefono);
}

type DatosDeFicha = Pick<Fila<'clientes'>, 'evento' | 'fecha_evento' | 'rol' | 'dia_o_noche' | 'talle_aprox'>;

/** 'Invitado · Casamiento 25/10 · Noche · Talle 48 · Turno sáb 10:15' (cabecera de la charla). */
export function resumenFicha(c: DatosDeFicha | null | undefined, proximoTurno?: string | null): string {
  if (!c) return '';
  return [
    c.rol ? ETIQUETA_ROL[c.rol] : null,
    c.evento ? `${ETIQUETA_EVENTO[c.evento] ?? c.evento}${c.fecha_evento ? ` ${diaMes(c.fecha_evento)}` : ''}` : null,
    c.dia_o_noche ? ETIQUETA_DIA_O_NOCHE[c.dia_o_noche] : null,
    c.talle_aprox ? `Talle ${c.talle_aprox}` : null,
    proximoTurno ? `Turno ${diaYHora(proximoTurno)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Próximo turno que ocupa agenda de un cliente (ISO de inicio) o null. */
export async function proximoTurno(db: ClienteDb, clienteId: string): Promise<string | null> {
  const { data, error } = await db
    .from('turnos')
    .select('inicio')
    .eq('cliente_id', clienteId)
    .gte('inicio', new Date().toISOString())
    .not('estado', 'in', ESTADOS_LIBERAN)
    .order('inicio', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.inicio ?? null;
}

// El equipo responde con el botón de mostrador (mostrador_enviar, 0028); la base marca ese
// mensaje saliente con este prefijo para que Lucía lo distinga en el historial que lee. Acá
// sirve para lo mismo: distinguirlo de un mensaje de Lucía sin mostrárselo al dueño.
const PREFIJO_MOSTRADOR = '[mostrador] ';

/** Texto de un mensaje para listas: el contenido (sin el prefijo [mostrador], ver
 *  autorDeMensaje), o el tipo si es un adjunto sin texto. */
export function textoDeMensaje(m: { contenido: string | null; tipo: string } | null | undefined): string {
  if (!m) return '';
  const contenido = m.contenido?.trim();
  if (contenido) return contenido.startsWith(PREFIJO_MOSTRADOR) ? contenido.slice(PREFIJO_MOSTRADOR.length) : contenido;
  return m.tipo && m.tipo !== 'texto' ? `(${m.tipo})` : '';
}

/**
 * Quién escribió un mensaje (corrección pedida por Mateo tras la auditoría de logica: antes
 * todo saliente se veía como de Lucía). 'cliente' si es entrante; si es saliente, 'mostrador'
 * cuando lo escribió el equipo (el prefijo que pone mostrador_enviar) y 'lucia' en cualquier
 * otro saliente.
 */
export function autorDeMensaje(m: { direccion: string; contenido: string | null } | null | undefined): 'cliente' | 'lucia' | 'mostrador' {
  if (m?.direccion === 'entrante') return 'cliente';
  return m?.contenido?.startsWith(PREFIJO_MOSTRADOR) ? 'mostrador' : 'lucia';
}
