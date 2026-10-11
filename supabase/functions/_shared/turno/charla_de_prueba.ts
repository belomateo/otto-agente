// Una charla inventada con el código real de Lucía (correrTurno), la base real y el modelo real, sin
// dejar rastro. Era el corazón de scripts/charla-de-prueba.ts (10/10, el probador que intenta confundir
// a Lucía); desde el 10/10 también lo usa el corrector de Lucía para su prueba invisible
// (supabase/functions/corrector/charla.ts). Un solo lugar, así las dos pruebas hablan con la misma
// Lucía de la misma forma.
//
// Quien llama abre la transacción (y antes `set local otto.sin_disparo = 'on'`, para que ningún
// trigger encole trabajos ni dispare envíos) y la deshace al terminar: así no se manda nada por
// WhatsApp y no queda nada en el panel. Esto solo arma el cliente y la charla de prueba adentro de esa
// transacción, corre los turnos y lee lo que quedó.

import { type ClienteSql, dbDesde } from "../db.ts";
import { type Calendario, calendarioDeEnsayo } from "../herramientas/tipos.ts";
import { correrTurno } from "./turno.ts";

export type CharlaDePrueba = {
  /** El nombre del perfil de WhatsApp (opcional). */
  nombre?: string;
  /** Lo que la ficha ya sabe al empezar (evento, fecha_evento…). */
  ficha?: Record<string, string | null>;
  /** Turnos que el cliente ya tiene. */
  turnos?: { inicio: string; estado?: string; tipo?: string; duracion_min?: number; confirmado?: boolean }[];
  /** Cada elemento es un turno del cliente: un texto, o varios seguidos. */
  mensajes: (string | string[])[];
};

export type EventoDePrueba = { tipo: string; detalle: Record<string, unknown> };

export type TurnoDePrueba = {
  /** Cuándo escribió el cliente. */
  momento: Date;
  cliente: string[];
  /** Lo que contestó Lucía (vacío si no contestó). */
  lucia: string[];
  /** Herramientas, errores y derivaciones de este turno, de la bitácora. */
  eventos: EventoDePrueba[];
  derivo: boolean;
  /** Lucía ya estaba apagada en la charla (pasó al equipo): este turno no corrió. */
  apagada: boolean;
};

export type ConsumoDePrueba = { modelo: string; tokensIn: number; tokensOut: number; costoUsd: number };

export type ResultadoCharlaDePrueba = {
  telefono: string;
  clienteId: string;
  conversacionId: string;
  turnos: TurnoDePrueba[];
  /** false: se cortó antes de terminar (`seguir` dijo que no). */
  completa: boolean;
  /** Lo que quedó en la base adentro de la transacción: contra esto se verifica, no contra lo que dijo Lucía. */
  estado: Record<string, unknown>;
  /** Lo que gastó Lucía en esta charla (consumo_llm, que se va con el rollback). */
  consumo: ConsumoDePrueba[];
};

export const CAMPOS_FICHA_DE_PRUEBA = [
  "evento", "fecha_evento", "rol", "dia_o_noche", "talle_aprox", "ciudad", "email", "color_preferido", "presupuesto_mencionado",
];

// Entre turno y turno del cliente pasan 2 minutos.
const ENTRE_TURNOS_MS = 2 * 60_000;

type Filas<T> = { rows: T[] };
const q = async <T>(sql: ClienteSql, texto: string, valores: unknown[] = []) => ((await sql.query(texto, valores)) as Filas<T>).rows;

export async function correrCharlaDePrueba(
  sql: ClienteSql,
  charla: CharlaDePrueba,
  p: {
    prompt: string;
    ahora: Date;
    tz: string;
    calendario?: Calendario;
    /** Antes de cada turno: false corta la charla ahí (por ejemplo, porque no queda tiempo). */
    seguir?: (indice: number) => boolean;
    /** Cuánto tiene el modelo en cada turno (por defecto, LIMITE_TURNO_MS de turno.ts). */
    limiteTurnoMs?: (indice: number) => number | undefined;
    /** Cuando cada turno termina (el script lo imprime a medida que avanza). */
    alTurno?: (t: TurnoDePrueba) => void;
  },
): Promise<ResultadoCharlaDePrueba> {
  if (!Array.isArray(charla.mensajes) || charla.mensajes.length === 0) throw new Error("La charla no tiene mensajes");
  const db = dbDesde(sql);

  // Teléfono de prueba (el analista y los reportes excluyen los 5490000…).
  const telefono = `549000${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const [{ id: clienteId }] = await q<{ id: string }>(
    sql,
    "insert into clientes (telefono, nombre) values ($1, $2) returning id::text as id",
    [telefono, charla.nombre ?? null],
  );
  const ficha = Object.entries(charla.ficha ?? {}).filter(([k]) => CAMPOS_FICHA_DE_PRUEBA.includes(k));
  for (const [campo, valor] of ficha) await sql.query(`update clientes set ${campo} = $2 where id = $1`, [clienteId, valor]);
  const [{ id: conversacionId }] = await q<{ id: string }>(
    sql,
    "insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id",
    [clienteId],
  );
  for (const t of charla.turnos ?? []) {
    const inicio = new Date(t.inicio);
    const minutos = t.duracion_min ?? 45;
    await sql.query(
      `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, confirmado, editado_por)
       values ($1, $2, $3, 1, $4, $5, $6, $7, 'prueba')`,
      [clienteId, t.tipo ?? "invitado", minutos, inicio.toISOString(), new Date(inicio.getTime() + minutos * 60_000).toISOString(),
        t.estado ?? "sin-confirmar", t.confirmado ?? (t.estado === "confirmado")],
    );
  }

  const turnos: TurnoDePrueba[] = [];
  let completa = true;
  for (let i = 0; i < charla.mensajes.length; i++) {
    if (p.seguir && !p.seguir(i)) {
      completa = false;
      break;
    }
    const textos = ([] as string[]).concat(charla.mensajes[i]);
    const momento = new Date(p.ahora.getTime() + i * ENTRE_TURNOS_MS);
    for (let k = 0; k < textos.length; k++) {
      await sql.query(
        "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', $2, $3)",
        [conversacionId, textos[k], new Date(momento.getTime() + k * 1000).toISOString()],
      );
    }
    const ahora = new Date(momento.getTime() + textos.length * 1000 + 4000);
    const [conv] = await q<{ estado: string; lucia_activa: boolean }>(
      sql,
      "select estado, lucia_activa from conversaciones where id = $1",
      [conversacionId],
    );
    if (!conv.lucia_activa) {
      const t: TurnoDePrueba = { momento, cliente: textos, lucia: [], eventos: [], derivo: false, apagada: true };
      turnos.push(t);
      p.alTurno?.(t);
      continue;
    }
    const r = await correrTurno(db, {
      clienteId, telefono, conversacionId, ahora, tz: p.tz, calendario: p.calendario ?? calendarioDeEnsayo, derivacionTel: null,
      prompt: p.prompt, yaDerivada: conv.estado === "derivada", limiteTurnoMs: p.limiteTurnoMs?.(i),
    });
    // La respuesta queda con la hora del turno, para que el próximo la vea en orden.
    await sql.query(
      "update mensajes set enviado_at = $2::timestamptz where conversacion_id = $1 and direccion = 'saliente' and enviado_at > $2::timestamptz",
      [conversacionId, ahora.toISOString()],
    );
    const eventos = await q<EventoDePrueba>(
      sql,
      `select tipo, detalle from eventos_agente where conversacion_id = $1 and tipo in ('herramienta', 'error', 'derivacion') order by creado_at`,
      [conversacionId],
    );
    // Se borran para que el turno siguiente lea solo los suyos.
    await sql.query("delete from eventos_agente where conversacion_id = $1", [conversacionId]);
    const t: TurnoDePrueba = { momento, cliente: textos, lucia: r.mensajesAlCliente, eventos, derivo: r.derivo, apagada: false };
    turnos.push(t);
    p.alTurno?.(t);
  }

  const turnosFinales = await q<Record<string, unknown>>(
    sql,
    "select tipo, inicio, estado, confirmado, probador from turnos where cliente_id = $1 order by inicio",
    [clienteId],
  );
  const [fichaFinal] = await q<Record<string, unknown>>(sql, `select nombre, ${CAMPOS_FICHA_DE_PRUEBA.join(", ")} from clientes where id = $1`, [clienteId]);
  const derivaciones = await q<Record<string, unknown>>(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  const notas = await q<{ texto: string }>(sql, "select texto from notas where cliente_id = $1 order by creado_at", [clienteId]);
  const [conv] = await q<Record<string, unknown>>(sql, "select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
  const consumo = await q<{ modelo: string; tokens_in: string; tokens_out: string; costo: string }>(
    sql,
    `select modelo, sum(tokens_in) as tokens_in, sum(tokens_out) as tokens_out, sum(costo_usd) as costo
       from consumo_llm where conversacion_id = $1 group by modelo order by modelo`,
    [conversacionId],
  );
  return {
    telefono,
    clienteId,
    conversacionId,
    turnos,
    completa,
    estado: { conversacion: conv, turnos: turnosFinales, ficha: fichaFinal, derivaciones, notas: notas.map((n) => n.texto) },
    consumo: consumo.map((c) => ({ modelo: c.modelo, tokensIn: Number(c.tokens_in), tokensOut: Number(c.tokens_out), costoUsd: Number(c.costo) })),
  };
}
