// Tipos compartidos por las 13 herramientas de Lucía (AGENTE.md § 4).
//
// Cada herramienta es un archivo con su nombre, su descripción (lo que lee el modelo; el dueño
// la puede reemplazar desde Configuración › Herramientas), su schema de parámetros (tool
// calling estricto) y `ejecutar`, que valida las precondiciones en código ANTES de tocar nada.
// Una herramienta nunca le cree al modelo: todo lo que afirma sale de la base o de la traza.

import type { Db } from "../db.ts";
import type { TipoTurno } from "../enums.ts";
import type { Traza } from "../traza.ts";

export type EsquemaJson = Record<string, unknown>;

// Un hueco libre: lo calcula logica (H1.13) por probador y duración, dentro del horario
// laboral. Hasta que 1.13 exista, y en los tests, lo da un doble con esta misma forma.
export type Hueco = { inicio: string; fin: string; probador: number };

export interface Agenda {
  huecos(p: { desde: string; hasta: string; tipo: TipoTurno; ahora: Date }): Promise<Hueco[]>;
}

export type TurnoParaCalendario = {
  turnoId: string;
  inicio: Date;
  fin: Date;
  tipo: TipoTurno;
  probador: number;
  nombre: string;
  telefono: string;
};

// Google Calendar (logica, H1.12). El emulador usa calendarioDeEnsayo (no toca nada).
export interface Calendario {
  crear(t: TurnoParaCalendario): Promise<{ eventoId: string | null }>;
  mover(eventoId: string | null, t: TurnoParaCalendario): Promise<{ eventoId: string | null }>;
  cancelar(eventoId: string | null): Promise<void>;
}

export const calendarioDeEnsayo: Calendario = {
  crear() {
    return Promise.resolve({ eventoId: null });
  },
  mover(eventoId) {
    return Promise.resolve({ eventoId });
  },
  cancelar() {
    return Promise.resolve();
  },
};

export type ContextoHerramienta = {
  db: Db;
  cliente: { id: string; telefono: string };
  conversacionId: string;
  ahora: Date;
  tz: string;
  traza: Traza;
  agenda: Agenda;
  calendario: Calendario;
  derivacionTel?: string | null;
};

// Lo que hace el código después de la respuesta de Lucía, no el modelo: el turno (H1.7) lo
// ejecuta. Mensajes armados en código (confirmación, link), fotos, cortar el turno.
export type Efectos = {
  mensajesAlCliente?: string[];
  imagenes?: string[];
  cortaTurno?: boolean;
  avisoEquipo?: { motivo: string; derivacionId: string };
};

export type Resultado =
  | { ok: true; datos: Record<string, unknown>; efectos?: Efectos }
  | { ok: false; rechazo: string; mensaje: string };

export interface Herramienta<A = Record<string, unknown>> {
  nombre: string;
  tipo: "consulta" | "accion";
  descripcion: string;
  parametros: EsquemaJson;
  ejecutar(args: A, ctx: ContextoHerramienta): Promise<Resultado>;
}

// El mensaje de un rechazo lo lee el modelo: dice qué pasó y qué hacer ahora.
export function rechazo(codigo: string, mensaje: string): Resultado {
  return { ok: false, rechazo: codigo, mensaje };
}

// Schema de objeto para tool calling estricto: todas las propiedades en required y ninguna de
// más. Lo opcional se declara aceptando null.
export function objeto(propiedades: Record<string, EsquemaJson>): EsquemaJson {
  return {
    type: "object",
    properties: propiedades,
    required: Object.keys(propiedades),
    additionalProperties: false,
  };
}

export function limpio(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}
