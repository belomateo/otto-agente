// Configuración (H1.8): todo lo que se edita en sus subpestañas — Lucía (presentación,
// contexto, reglas), Agenda (horario del local, franjas de turnos, duraciones, probadores y
// reserva de urgencia), Herramientas, Enlaces y Notas. Las reglas traen la forma de `reglas`
// de lib/mock-data.ts ({ i, t }) más id y versión. El texto del prompt base no viene acá: es
// solo admin (GET /api/configuracion/prompt-base). Accesos es aparte (lib/queries/accesos.ts,
// H1.10).
import 'server-only';
import { DIAS_LARGOS } from '@/lib/formato';
import type { ClienteDb, Fila } from './comun';

export type Configuracion = {
  reglas: ({ i: string; t: string } & Pick<Fila<'reglas_agente'>, 'id' | 'numero' | 'texto' | 'activo' | 'version'>)[];
  contexto: Pick<Fila<'contexto_agente'>, 'id' | 'clave' | 'valor' | 'version'>[];
  /** Atajo: el valor de contexto_agente 'presentacion' (lo primero que dice Lucía). */
  presentacion: string | null;
  agenda: {
    /** Horario del local (atención humana, avisos fuera de horario). No es cuándo se dan turnos. */
    horarios: (Fila<'horarios'> & { dia: string })[];
    /** Cuándo se dan turnos (0030): varias franjas por día, ordenadas por día y hora. */
    franjas: (Fila<'franjas_turnos'> & { dia: string })[];
    /** Fechas puntuales cerradas (0061): feriados y cierres excepcionales, aparte del horario
     *  semanal de arriba. */
    cierres: Fila<'cierres_agenda'>[];
    duraciones: Pick<Fila<'duraciones_turno'>, 'id' | 'tipo' | 'duracion_min' | 'version'>[];
    configuracion: Pick<
      Fila<'configuracion_agenda'>,
      'id' | 'cantidad_probadores' | 'escalonado_min' | 'dias_reserva_urgencia' | 'aviso_turno_min' | 'version'
    > | null;
  };
  herramientas: Fila<'herramientas_agente'>[];
  enlaces: Fila<'enlaces'>[];
  notas: Fila<'notas_dueno'>[];
  prompt_base: Pick<Fila<'prompt_base'>, 'version' | 'editado_por' | 'editado_at'> | null;
};

export async function obtenerConfiguracion(db: ClienteDb): Promise<Configuracion> {
  const [reglas, contexto, horarios, franjas, cierres, duraciones, config, herramientas, enlaces, notas, prompt] =
    await Promise.all([
      db.from('reglas_agente').select('id, numero, texto, activo, version').order('numero'),
      db.from('contexto_agente').select('id, clave, valor, version').order('clave'),
      db.from('horarios').select('*').order('dia_semana'),
      db.from('franjas_turnos').select('*').order('dia_semana').order('desde'),
      db.from('cierres_agenda').select('*').order('fecha'),
      db.from('duraciones_turno').select('id, tipo, duracion_min, version').order('duracion_min').order('tipo'),
      db
        .from('configuracion_agenda')
        .select('id, cantidad_probadores, escalonado_min, dias_reserva_urgencia, aviso_turno_min, version')
        .maybeSingle(),
      db.from('herramientas_agente').select('*').order('orden'),
      db.from('enlaces').select('*').order('nombre'),
      db.from('notas_dueno').select('*').order('creado_at', { ascending: false }),
      db.from('prompt_base').select('version, editado_por, editado_at').maybeSingle(),
    ]);
  for (const r of [reglas, contexto, horarios, franjas, cierres, duraciones, config, herramientas, enlaces, notas, prompt]) {
    if (r.error) throw r.error;
  }
  const filasContexto = contexto.data ?? [];
  return {
    reglas: (reglas.data ?? []).map((r) => ({ ...r, i: String(r.numero), t: r.texto })),
    contexto: filasContexto,
    presentacion: filasContexto.find((c) => c.clave === 'presentacion')?.valor ?? null,
    agenda: {
      horarios: (horarios.data ?? []).map((h) => ({ ...h, dia: DIAS_LARGOS[h.dia_semana] })),
      franjas: (franjas.data ?? []).map((f) => ({ ...f, dia: DIAS_LARGOS[f.dia_semana] })),
      cierres: cierres.data ?? [],
      duraciones: duraciones.data ?? [],
      configuracion: config.data,
    },
    herramientas: herramientas.data ?? [],
    enlaces: enlaces.data ?? [],
    notas: notas.data ?? [],
    prompt_base: prompt.data,
  };
}
