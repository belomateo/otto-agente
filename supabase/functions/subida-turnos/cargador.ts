// Subida de turnos — el CARGADOR. Escribe el turno con la misma regla que Lucía (primer probador libre, sin pisar a
// nadie; la base rechaza el solapamiento con turnos_sin_solapamiento) y lo firma «subida-automatica» para que en
// el panel se sepa quién lo cargó. No manda ningún mensaje al cliente: el recordatorio sale solo, como siempre.

import type { Db } from "../_shared/db.ts";
import { ESTADO_TURNO_NUEVO, ESTADOS_QUE_LIBERAN, type TipoTurno } from "../_shared/enums.ts";
import { MS_POR_MINUTO } from "../_shared/tiempo.ts";

export const AUTOR_SUBIDA = "subida-automatica";
const TOPE_PROBADORES = 3;

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

const esChoque = (e: unknown) => (e as { code?: string })?.code === "23P01";

export async function duracionDelTipo(db: Db, tipo: TipoTurno): Promise<number> {
  const f = await db.consulta<{ duracion_min: number }>("select duracion_min from duraciones_turno where tipo = $1", [tipo]);
  return f[0] ? Number(f[0].duracion_min) : 45;
}

export type ResultadoCarga = { ok: true; turnoId: string; probador: number } | { ok: false; motivo: string };

export async function cargarTurno(db: Db, p: { clienteId: string; tipo: TipoTurno; inicio: Date; duracionMin: number }): Promise<ResultadoCarga> {
  const fin = new Date(p.inicio.getTime() + p.duracionMin * MS_POR_MINUTO);
  for (let probador = 1; probador <= TOPE_PROBADORES; probador++) {
    try {
      const f = await db.consulta(SQL_INSERTAR, [p.clienteId, p.tipo, p.duracionMin, probador, p.inicio.toISOString(), fin.toISOString(), [...ESTADOS_QUE_LIBERAN], AUTOR_SUBIDA]);
      if (f[0]) return { ok: true, turnoId: String(f[0].id), probador };
    } catch (e) {
      if (!esChoque(e)) throw e;
    }
  }
  return { ok: false, motivo: "no hay probador libre a esa hora" };
}

export async function moverTurno(db: Db, p: { turnoId: string; inicio: Date; duracionMin: number }): Promise<ResultadoCarga> {
  const fin = new Date(p.inicio.getTime() + p.duracionMin * MS_POR_MINUTO);
  for (let probador = 1; probador <= TOPE_PROBADORES; probador++) {
    try {
      const f = await db.consulta(SQL_MOVER, [p.turnoId, p.inicio.toISOString(), fin.toISOString(), probador, p.duracionMin, ESTADO_TURNO_NUEVO, [...ESTADOS_QUE_LIBERAN], AUTOR_SUBIDA]);
      if (f[0]) return { ok: true, turnoId: String(f[0].id), probador };
    } catch (e) {
      if (!esChoque(e)) throw e;
    }
  }
  return { ok: false, motivo: "no hay probador libre a esa hora" };
}
