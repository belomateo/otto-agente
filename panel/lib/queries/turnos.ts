// Turnos (H1.8): la agenda de un día. Cada turno trae la forma de `TurnoDelDia` de
// lib/mock-data.ts (lo que hoy dibujan BloqueTurno y la lista mobile) más los datos crudos
// que Fase 2 necesita (id, probador, inicio/fin, aviso de sincronización de 0011).
import 'server-only';
import type { TurnoDelDia } from '@/lib/mock-data';
import { ESTILO_ESTADO_TURNO, ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import { diaDeLaSemana, fechaEnZona, fechaLarga, hora, rangoDelDia, sumarDias } from '@/lib/formato';
import { ESTADOS_LIBERAN, nombreDe, type ClienteDb } from './comun';

export type FilaTurno = TurnoDelDia & {
  id: string;
  cliente_id: string;
  tipo: string;
  estado: string;
  probador: number;
  inicio: string;
  fin: string;
  duracion_min: number;
  confirmado: boolean;
  /** Aviso de sincronización con Google Calendar (0011); null = sin aviso. */
  aviso: string | null;
  /** Quién confirmó (0031): 'cliente' por el botón de WhatsApp, o el email de quien dio OK al cartel. */
  confirmado_por: string | null;
  /** OK del cartel del turno (0031, decisión #10); null = nadie lo dio. */
  aviso_ok_at: string | null;
  aviso_ok_por: string | null;
};

export type AgendaDelDia = {
  fecha: string;
  /** 'Sábado 12 de septiembre' */
  titulo: string;
  /** Horario del local ese día (tabla horarios); null = cerrado. No es cuándo se dan turnos. */
  horario: { apertura: string; cierre: string; corte_desde: string | null; corte_hasta: string | null } | null;
  /** Franjas en las que se dan turnos ese día (0030); [] = ese día no se dan turnos. En una
   *  franja con P probadores toman turnos los probadores 1 a P. */
  franjas: { desde: string; hasta: string; probadores: number }[];
  probadores: number | null;
  turnos: FilaTurno[];
  /** Turnos de mañana que siguen sin confirmar (chip "Sin confirmar para mañana"). */
  sin_confirmar_manana: number;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export async function turnosDelDia(
  db: ClienteDb,
  fecha: string,
  o: { incluirCancelados?: boolean } = {}
): Promise<AgendaDelDia> {
  const { desde, hasta } = rangoDelDia(fecha);
  const manana = rangoDelDia(sumarDias(fechaEnZona(), 1));

  let q = db
    .from('turnos')
    .select(
      'id, cliente_id, tipo, estado, probador, inicio, fin, duracion_min, confirmado, aviso, confirmado_por, aviso_ok_at, aviso_ok_por, clientes(nombre, telefono)'
    )
    .gte('inicio', desde)
    .lt('inicio', hasta)
    .order('inicio', { ascending: true })
    .order('probador', { ascending: true });
  if (!o.incluirCancelados) q = q.not('estado', 'in', ESTADOS_LIBERAN);

  const [turnos, horario, franjas, config, sinConfirmar] = await Promise.all([
    q,
    db
      .from('horarios')
      .select('hora_apertura, hora_cierre, corte_desde, corte_hasta, activo')
      .eq('dia_semana', diaDeLaSemana(fecha))
      .maybeSingle(),
    db
      .from('franjas_turnos')
      .select('desde, hasta, probadores')
      .eq('dia_semana', diaDeLaSemana(fecha))
      .order('desde'),
    db.from('configuracion_agenda').select('cantidad_probadores').maybeSingle(),
    db
      .from('turnos')
      .select('id', { count: 'exact', head: true })
      .gte('inicio', manana.desde)
      .lt('inicio', manana.hasta)
      .eq('estado', 'sin-confirmar'),
  ]);
  for (const r of [turnos, horario, franjas, config, sinConfirmar]) if (r.error) throw r.error;

  const h = horario.data && horario.data.activo ? horario.data : null;
  return {
    fecha,
    titulo: fechaLarga(fecha),
    horario: h
      ? {
          apertura: hhmm(h.hora_apertura)!,
          cierre: hhmm(h.hora_cierre)!,
          corte_desde: hhmm(h.corte_desde),
          corte_hasta: hhmm(h.corte_hasta),
        }
      : null,
    franjas: (franjas.data ?? []).map((f) => ({
      desde: hhmm(f.desde)!,
      hasta: hhmm(f.hasta)!,
      probadores: f.probadores,
    })),
    probadores: config.data?.cantidad_probadores ?? null,
    sin_confirmar_manana: sinConfirmar.count ?? 0,
    turnos: (turnos.data ?? []).map((t) => {
      const estilo = ESTILO_ESTADO_TURNO[t.estado] ?? ESTILO_ESTADO_TURNO['sin-confirmar'];
      return {
        id: t.id,
        cliente_id: t.cliente_id,
        tipo: t.tipo,
        estado: t.estado,
        probador: t.probador,
        inicio: t.inicio,
        fin: t.fin,
        duracion_min: t.duracion_min,
        confirmado: t.confirmado,
        aviso: t.aviso,
        confirmado_por: t.confirmado_por,
        aviso_ok_at: t.aviso_ok_at,
        aviso_ok_por: t.aviso_ok_por,
        h: hora(t.inicio),
        n: nombreDe(t.clientes),
        t: `${ETIQUETA_TIPO_TURNO[t.tipo] ?? t.tipo} · ${t.duracion_min}’`,
        p: `Probador ${t.probador}`,
        e: estilo.etiqueta,
        eb: estilo.eb,
        ef: estilo.ef,
        borde: estilo.borde,
      };
    }),
  };
}
