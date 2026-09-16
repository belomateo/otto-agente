// Lo que comparten agendar_turno, reprogramar_turno y cancelar_turno: leer un turno, saber si
// el cliente ya tiene uno activo, ocupar un probador libre sin pisar a nadie y reflejar el
// cambio en Google Calendar. La base es la fuente de verdad; Calendar es un reflejo: si falla,
// el turno queda igual y con `aviso` para que el reintento lo sincronice (PROCESOS.md § 8).

import type { Db } from "../db.ts";
import {
  AUTOR_LUCIA,
  ESTADO_TURNO_NUEVO,
  ESTADOS_QUE_LIBERAN,
  ESTADOS_TURNO_ACTIVO,
  type TipoTurno,
} from "../enums.ts";
import { MS_POR_MINUTO } from "../tiempo.ts";
import type { HuecoOfrecido, Traza } from "../traza.ts";
import type { ContextoHerramienta, TurnoParaCalendario } from "./tipos.ts";

export type Turno = {
  id: string;
  clienteId: string;
  tipo: TipoTurno;
  inicio: Date;
  fin: Date;
  estado: string;
  probador: number;
  googleEventId: string | null;
};

export async function leerTurno(db: Db, turnoId: string): Promise<Turno | null> {
  const filas = await db.consulta(
    `select id::text as id, cliente_id::text as cliente_id, tipo, inicio, fin, estado, probador, google_event_id
       from turnos where id = $1::uuid`,
    [turnoId],
  );
  const f = filas[0];
  if (!f) return null;
  return {
    id: String(f.id),
    clienteId: String(f.cliente_id),
    tipo: f.tipo as TipoTurno,
    inicio: new Date(f.inicio as string),
    fin: new Date(f.fin as string),
    estado: String(f.estado),
    probador: Number(f.probador),
    googleEventId: f.google_event_id === null ? null : String(f.google_event_id),
  };
}

export async function turnoActivoDelCliente(
  db: Db,
  clienteId: string,
  ahora: Date,
): Promise<{ id: string; inicio: Date } | null> {
  const filas = await db.consulta(
    `select id::text as id, inicio from turnos
      where cliente_id = $1::uuid and estado = any($2::text[]) and fin > $3::timestamptz
      order by inicio limit 1`,
    [clienteId, [...ESTADOS_TURNO_ACTIVO], ahora.toISOString()],
  );
  return filas[0] ? { id: String(filas[0].id), inicio: new Date(filas[0].inicio as string) } : null;
}

export async function duracionDelTipo(db: Db, tipo: TipoTurno): Promise<number | null> {
  const filas = await db.consulta("select duracion_min from duraciones_turno where tipo = $1", [tipo]);
  return filas[0] ? Number(filas[0].duracion_min) : null;
}

export function minutosEntre(inicio: Date, fin: Date): number {
  return Math.round((fin.getTime() - inicio.getTime()) / MS_POR_MINUTO);
}

// Los huecos que buscar_horarios le mostró al modelo EN ESTE TURNO para ese tipo y esa hora
// (uno por probador libre).
export function huecosDeLaTraza(traza: Traza, tipo: TipoTurno, inicio: Date): HuecoOfrecido[] {
  return traza.huecosOfrecidos.filter((h) => h.tipo === tipo && new Date(h.inicio).getTime() === inicio.getTime());
}

// El NOT EXISTS evita el choque en el caso normal. Si dos reservas llegan a la vez, la
// restricción de la base (turnos_sin_solapamiento, paneles 0011) rechaza la segunda con 23P01
// y se prueba el probador siguiente.
const SQL_INSERTAR = `
  insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, editado_por)
  select $1::uuid, $2::text, $3::int, $4::int, $5::timestamptz, $6::timestamptz, $8::text
  where not exists (
    select 1 from turnos t
     where t.probador = $4::int and not (t.estado = any($7::text[]))
       and tstzrange(t.inicio, t.fin, '[)') && tstzrange($5::timestamptz, $6::timestamptz, '[)'))
  returning id::text as id`;

const SQL_MOVER = `
  update turnos
     set inicio = $2::timestamptz, fin = $3::timestamptz, probador = $4::int, duracion_min = $5::int,
         estado = $6::text, confirmado = false, confirmado_at = null, recordatorio_enviado_at = null,
         editado_por = $8::text
   where id = $1::uuid
     and not exists (
       select 1 from turnos t
        where t.id <> $1::uuid and t.probador = $4::int and not (t.estado = any($7::text[]))
          and tstzrange(t.inicio, t.fin, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)'))
  returning id::text as id`;

function esChoque(e: unknown): boolean {
  return (e as { code?: string })?.code === "23P01";
}

export async function insertarEnProbadorLibre(
  db: Db,
  p: { clienteId: string; tipo: TipoTurno; inicio: Date; fin: Date; probadores: number[] },
): Promise<{ id: string; probador: number } | null> {
  for (const probador of p.probadores) {
    try {
      const filas = await db.consulta(SQL_INSERTAR, [
        p.clienteId, p.tipo, minutosEntre(p.inicio, p.fin), probador,
        p.inicio.toISOString(), p.fin.toISOString(), [...ESTADOS_QUE_LIBERAN], AUTOR_LUCIA,
      ]);
      if (filas[0]) return { id: String(filas[0].id), probador };
    } catch (e) {
      if (!esChoque(e)) throw e;
    }
  }
  return null;
}

// Mover reinicia el ciclo: vuelve a "sin confirmar" y el recordatorio sale de nuevo para el
// horario nuevo (confirmar_turno, AGENTE.md § 4).
export async function moverAProbadorLibre(
  db: Db,
  p: { turnoId: string; inicio: Date; fin: Date; probadores: number[] },
): Promise<{ probador: number } | null> {
  for (const probador of p.probadores) {
    try {
      const filas = await db.consulta(SQL_MOVER, [
        p.turnoId, p.inicio.toISOString(), p.fin.toISOString(), probador,
        minutosEntre(p.inicio, p.fin), ESTADO_TURNO_NUEVO, [...ESTADOS_QUE_LIBERAN], AUTOR_LUCIA,
      ]);
      if (filas[0]) return { probador };
    } catch (e) {
      if (!esChoque(e)) throw e;
    }
  }
  return null;
}

export async function alCalendario(
  ctx: ContextoHerramienta,
  accion: "crear" | "mover" | "cancelar",
  t: TurnoParaCalendario & { googleEventId: string | null },
): Promise<void> {
  try {
    if (accion === "cancelar") {
      await ctx.calendario.cancelar(t.googleEventId);
      return;
    }
    const r = accion === "crear" ? await ctx.calendario.crear(t) : await ctx.calendario.mover(t.googleEventId, t);
    if (r.eventoId !== t.googleEventId) {
      await ctx.db.consulta("update turnos set google_event_id = $2 where id = $1::uuid", [t.turnoId, r.eventoId]);
    }
  } catch (e) {
    const detalle = String((e as Error)?.message ?? e).slice(0, 200);
    await ctx.db.consulta("update turnos set aviso = $2 where id = $1::uuid", [
      t.turnoId,
      `Google Calendar: no se pudo ${accion} el evento (${detalle}). Queda para el reintento.`,
    ]);
  }
}
