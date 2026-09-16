// Bandeja (H1.8): la lista de charlas y el hilo de una charla. La lista devuelve la forma de
// `Conversacion` de lib/mock-data.ts (lo que hoy dibuja ConversationList) más los ids que
// Fase 2 necesita para abrir cada charla.
import 'server-only';
import type { Conversacion } from '@/lib/mock-data';
import type { Json } from '@/lib/tipos-db';
import { CHIP_CONVERSACION, ESTILO_MOTIVO, ETIQUETA_EVENTO } from '@/lib/etiquetas';
import { fechaEnZona, hora, momentoCorto } from '@/lib/formato';
import { autorDeMensaje, nombreDe, normalizar, proximoTurno, resumenFicha, textoDeMensaje, type ClienteDb } from './comun';

export const FILTROS_BANDEJA = ['todas', 'lucia', 'persona', 'sin-respuesta'] as const;
export type FiltroBandeja = (typeof FILTROS_BANDEJA)[number];

export type FilaBandeja = Conversacion & {
  id: string;
  cliente_id: string;
  estado: string;
  /** El último mensaje es del cliente: nadie le contestó todavía. */
  sin_respuesta: boolean;
};

// Las charlas más recientes. La búsqueda mira nombre, teléfono y último mensaje de estas.
const LIMITE = 200;

export async function listarConversaciones(
  db: ClienteDb,
  o: { filtro?: FiltroBandeja; busqueda?: string } = {}
): Promise<FilaBandeja[]> {
  let q = db
    .from('conversaciones')
    .select(
      'id, cliente_id, estado, iniciado_at, ultimo_mensaje_at, clientes(nombre, telefono, evento), mensajes(contenido, direccion, tipo, enviado_at), derivaciones(motivo, estado)'
    )
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .order('enviado_at', { referencedTable: 'mensajes', ascending: false })
    .limit(1, { referencedTable: 'mensajes' })
    .limit(LIMITE);
  if (o.filtro === 'lucia') q = q.eq('estado', 'activa');
  if (o.filtro === 'persona') q = q.eq('estado', 'derivada');
  const { data, error } = await q;
  if (error) throw error;

  const ahora = new Date();
  let filas: FilaBandeja[] = (data ?? []).map((c) => {
    const ultimo = c.mensajes[0];
    const urgente = c.derivaciones.some((d) => d.estado === 'pendiente' && ESTILO_MOTIVO[d.motivo]?.urgente);
    const evento = c.clientes?.evento;
    const tag = urgente ? 'Urgente' : evento ? (ETIQUETA_EVENTO[evento] ?? '') : '';
    const chip = CHIP_CONVERSACION[c.estado] ?? CHIP_CONVERSACION.cerrada;
    return {
      id: c.id,
      cliente_id: c.cliente_id,
      estado: c.estado,
      sin_respuesta: ultimo?.direccion === 'entrante',
      n: nombreDe(c.clientes),
      m: textoDeMensaje(ultimo),
      h: momentoCorto(c.ultimo_mensaje_at ?? c.iniciado_at, ahora),
      chip: chip.chip,
      cb: chip.cb,
      cf: chip.cf,
      bg: 'transparent',
      tag,
      hasTag: tag !== '',
    };
  });
  if (o.filtro === 'sin-respuesta') filas = filas.filter((f) => f.sin_respuesta && f.estado !== 'cerrada');
  const b = normalizar(o.busqueda ?? '');
  if (b) filas = filas.filter((f) => normalizar(`${f.n} ${f.m}`).includes(b));
  return filas;
}

export type MensajeCharla = {
  id: string;
  direccion: string;
  tipo: string;
  texto: string;
  /** Quién lo escribió: 'cliente' (entrante), 'lucia' o 'mostrador' (el equipo, botón de
   *  mostrador). Antes de esto todo saliente se dibujaba como de Lucía (corrección pedida por
   *  Mateo tras la auditoría de logica). */
  autor: 'cliente' | 'lucia' | 'mostrador';
  /** '10:01' */
  hora: string;
  /** 'YYYY-MM-DD' en la zona del negocio, para separar por día. */
  fecha: string;
};
export type EventoCharla = { id: string; tipo: string; detalle: Json; hora: string; creado_at: string };
export type Charla = {
  id: string;
  estado: string;
  quien: 'Lucía' | 'Persona' | 'Cerrada';
  cliente: { id: string; nombre: string; telefono: string; email: string | null; resumen: string; etiqueta: string };
  mensajes: MensajeCharla[];
  eventos: EventoCharla[];
};

// Tope de mensajes y eventos por charla. Una charla de alquiler no llega ni cerca.
const LIMITE_HILO = 500;

export async function obtenerCharla(db: ClienteDb, id: string): Promise<Charla | null> {
  const { data: c, error } = await db
    .from('conversaciones')
    .select('id, estado, cliente_id, clientes(id, nombre, telefono, email, evento, fecha_evento, rol, dia_o_noche, talle_aprox)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const [mensajes, eventos, turno] = await Promise.all([
    db
      .from('mensajes')
      .select('id, direccion, tipo, contenido, enviado_at')
      .eq('conversacion_id', id)
      .order('enviado_at', { ascending: true })
      .limit(LIMITE_HILO),
    db
      .from('eventos_agente')
      .select('id, tipo, detalle, creado_at')
      .eq('conversacion_id', id)
      .order('creado_at', { ascending: true })
      .limit(LIMITE_HILO),
    proximoTurno(db, c.cliente_id),
  ]);
  if (mensajes.error) throw mensajes.error;
  if (eventos.error) throw eventos.error;

  const evento = c.clientes?.evento;
  return {
    id: c.id,
    estado: c.estado,
    quien: (CHIP_CONVERSACION[c.estado] ?? CHIP_CONVERSACION.cerrada).chip,
    cliente: {
      id: c.cliente_id,
      nombre: nombreDe(c.clientes),
      telefono: c.clientes?.telefono ?? '',
      email: c.clientes?.email ?? null,
      resumen: resumenFicha(c.clientes, turno),
      etiqueta: evento ? (ETIQUETA_EVENTO[evento] ?? '') : '',
    },
    mensajes: (mensajes.data ?? []).map((m) => ({
      id: m.id,
      direccion: m.direccion,
      tipo: m.tipo,
      texto: textoDeMensaje(m),
      autor: autorDeMensaje(m),
      hora: hora(m.enviado_at),
      fecha: fechaEnZona(new Date(m.enviado_at)),
    })),
    eventos: (eventos.data ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      detalle: e.detalle,
      hora: hora(e.creado_at),
      creado_at: e.creado_at,
    })),
  };
}
