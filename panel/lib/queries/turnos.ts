// Turnos (H1.8): la agenda de un día. Cada turno trae la forma de `TurnoDelDia` de
// lib/mock-data.ts (lo que hoy dibujan BloqueTurno y la lista mobile) más los datos crudos
// que Fase 2 necesita (id, probador, inicio/fin, aviso de sincronización de 0011).
import 'server-only';
import type { TurnoDelDia } from '@/lib/mock-data';
import { ESTILO_ESTADO_TURNO, ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import { diaDeLaSemana, diasEnMes, fechaEnZona, fechaLarga, hora, rangoDelDia, rangoDelMes, sumarDias } from '@/lib/formato';
import { ESTADOS_LIBERAN, nombreDe, type ClienteDb } from './comun';
import { aBloqueoDelDia, faltaLaTabla, listarBloqueos, type BloqueoDelDia } from './bloqueos';

export type FilaTurno = TurnoDelDia & {
  id: string;
  /** La que hay que mandar en el PATCH de estado (lib/edicion, entidad `turnos`): sin esto,
   *  el panel no tiene qué mandar y el PATCH da 400 siempre (falta version). */
  version: number;
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
  /** El cliente con el evento más cercano: le tocó el turno más próximo de la agenda (0046,
   *  decisión de Mateo). Lo pone logica desde el cálculo de huecos. */
  urgencia: boolean;
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
  /** Cierre puntual de ese día (0061, lo pone solo la dueña); null = no está cerrado. Cerrado, no
   *  se dan turnos aunque `franjas` diga que sí — `franjas` es el horario semanal, esto la excepción. */
  cierre: { motivo: string | null } | null;
  /** Horarios bloqueados ese día (0067), por hora y probador (primero los de todos). Ahí no se
   *  dan turnos; los que ya estaban agendados siguen en `turnos`, no se tocan. */
  bloqueos: BloqueoDelDia[];
};

export type AgendaSemana = {
  /** Lunes y domingo de la semana, ambos inclusive (convención Argentina). */
  semana: { desde: string; hasta: string };
  dias: AgendaDelDia[];
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
      'id, version, cliente_id, tipo, estado, probador, inicio, fin, duracion_min, confirmado, aviso, confirmado_por, aviso_ok_at, aviso_ok_por, urgencia, clientes(nombre, telefono)'
    )
    .gte('inicio', desde)
    .lt('inicio', hasta)
    .order('inicio', { ascending: true })
    .order('probador', { ascending: true });
  if (!o.incluirCancelados) q = q.not('estado', 'in', ESTADOS_LIBERAN);

  const [turnos, horario, franjas, config, sinConfirmar, cierre, bloqueos] = await Promise.all([
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
    // Contra el texto de la fecha, no contra un Date: la columna es date y el huso del servidor
    // correría el día (el bug del feriado que avisó logica, ver turno-alta.ts).
    db.from('cierres_agenda').select('motivo').eq('fecha', fecha).maybeSingle(),
    listarBloqueos(db, fecha, fecha),
  ]);
  for (const r of [turnos, horario, franjas, config, sinConfirmar, cierre]) if (r.error) throw r.error;

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
    cierre: cierre.data ? { motivo: cierre.data.motivo } : null,
    bloqueos: bloqueos.map(aBloqueoDelDia),
    turnos: (turnos.data ?? []).map((t) => {
      const estilo = ESTILO_ESTADO_TURNO[t.estado] ?? ESTILO_ESTADO_TURNO['sin-confirmar'];
      return {
        id: t.id,
        version: t.version,
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
        urgencia: t.urgencia,
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

// Vista Semana de Turnos (pedido de Mateo, 17/9): no repite la consulta, la corre 7 veces.
// `desde` se normaliza al lunes de esa semana (convención Argentina, lunes a domingo) antes de
// armar el rango — quien llama no tiene que calcularlo. diaDeLaSemana() da 0=domingo..6=sábado
// (0007/horarios): si cae domingo, el lunes de ESA semana quedó 6 días atrás; cualquier otro
// día, dow - 1 días atrás.
export async function turnosDeLaSemana(
  db: ClienteDb,
  desde: string,
  o: { incluirCancelados?: boolean } = {}
): Promise<AgendaSemana> {
  const dow = diaDeLaSemana(desde);
  const lunes = sumarDias(desde, dow === 0 ? -6 : -(dow - 1));
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const dias = await Promise.all(fechas.map((f) => turnosDelDia(db, f, o)));
  return { semana: { desde: fechas[0], hasta: fechas[6] }, dias };
}

export type DiaDelMes = {
  fecha: string;
  /** Turnos que ocupan la agenda ese día (sin cancelados/no-vino, salvo incluirCancelados). */
  total: number;
  sin_confirmar: number;
  /** Cierre puntual (0061); null = no está cerrado. Misma forma que AgendaDelDia.cierre. */
  cierre: { motivo: string | null } | null;
  /** Cuántos horarios bloqueados tiene ese día (0067). El detalle está en la agenda del día. */
  bloqueos: number;
};

export type AgendaMes = {
  mes: string;
  dias: DiaDelMes[];
};

// Vista Mensual (pedido de Mateo, 19/9): un conteo por día, no los turnos completos — 30 días
// con su ficha sería demasiado dato para pintar una grilla. Una sola consulta liviana (sin
// joins) para todo el mes, agregada acá; todos los días del mes salen en `dias`, con 0 los que
// no tienen turnos (así front no tiene que calcular cuántos días tiene el mes). Los cierres y
// los bloqueos (0061/0067) van igual: una consulta por tabla para todo el mes, por el texto de
// la fecha (columna date: ni pasa por Date ni por el huso del servidor).
export async function turnosDelMes(db: ClienteDb, mes: string, o: { incluirCancelados?: boolean } = {}): Promise<AgendaMes> {
  const { desde, hasta } = rangoDelMes(mes);
  const primero = `${mes}-01`;
  const ultimo = `${mes}-${String(diasEnMes(mes)).padStart(2, '0')}`;
  let q = db.from('turnos').select('inicio, estado').gte('inicio', desde).lt('inicio', hasta);
  if (!o.incluirCancelados) q = q.not('estado', 'in', ESTADOS_LIBERAN);
  const [turnos, cierres, bloqueos] = await Promise.all([
    q,
    db.from('cierres_agenda').select('fecha, motivo').gte('fecha', primero).lte('fecha', ultimo),
    db.from('bloqueos_agenda').select('fecha').gte('fecha', primero).lte('fecha', ultimo),
  ]);
  if (turnos.error) throw turnos.error;
  if (cierres.error) throw cierres.error;
  // Sin 0067 aplicada todavía, el mes se pinta igual, sin bloqueos (ver faltaLaTabla).
  if (bloqueos.error && !faltaLaTabla(bloqueos.error)) throw bloqueos.error;

  const porDia = new Map<string, { total: number; sin_confirmar: number }>();
  for (const t of turnos.data ?? []) {
    const fecha = fechaEnZona(new Date(t.inicio));
    const actual = porDia.get(fecha) ?? { total: 0, sin_confirmar: 0 };
    actual.total++;
    if (t.estado === 'sin-confirmar') actual.sin_confirmar++;
    porDia.set(fecha, actual);
  }
  const cierrePorDia = new Map((cierres.data ?? []).map((c) => [c.fecha, { motivo: c.motivo }]));
  const bloqueosPorDia = new Map<string, number>();
  for (const b of bloqueos.data ?? []) bloqueosPorDia.set(b.fecha, (bloqueosPorDia.get(b.fecha) ?? 0) + 1);

  const dias = Array.from({ length: diasEnMes(mes) }, (_, i) => {
    const fecha = `${mes}-${String(i + 1).padStart(2, '0')}`;
    return {
      fecha,
      ...(porDia.get(fecha) ?? { total: 0, sin_confirmar: 0 }),
      cierre: cierrePorDia.get(fecha) ?? null,
      bloqueos: bloqueosPorDia.get(fecha) ?? 0,
    };
  });
  return { mes, dias };
}
