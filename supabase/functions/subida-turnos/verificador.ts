// Subida de turnos — el VERIFICADOR (código puro, sin modelo). Recibe lo que leyó el lector y decide qué se hace.
// Nunca confía en el modelo: la frase tiene que estar en la charla, el día y la hora tienen que ser reales y el
// turno tiene que poder cargarse sin pisar a nadie. Ante la duda no carga: va a la lista de revisión.

import { instanteLocal } from "../_shared/tiempo.ts";
import type { Acuerdo } from "./lector.ts";

export type TurnoDelCliente = { id: string; inicio: Date; estado: string };

export type Decision =
  | { accion: "cargar"; inicio: Date }
  | { accion: "mover"; inicio: Date; turnoId: string }
  | { accion: "ya_esta"; inicio: Date }
  | { accion: "pasado"; inicio: Date }
  | { accion: "falta_datos"; motivo: string }
  | { accion: "dudoso"; motivo: string }
  | { accion: "sin_acuerdo" };

// Una hora y un día reales: «2026-10-15» y «13:30», sin salirse de calendario.
export function esDiaYHoraReal(dia: string | null, hora: string | null): boolean {
  if (!dia || !hora) return false;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!d || !h) return false;
  const [anio, mes, diaMes] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hh, mm] = [Number(h[1]), Number(h[2])];
  if (hh > 23 || mm > 59) return false;
  const f = new Date(Date.UTC(anio, mes - 1, diaMes));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === diaMes;
}

// La frase que citó el lector tiene que ser (casi) copia de un mensaje de la charla: si no, el modelo la inventó.
export function fraseEstaEnLaCharla(frase: string, textos: string[]): boolean {
  const limpia = frase.toLowerCase().replace(/\s+/g, " ").trim();
  if (limpia.length < 2 || limpia === "nada") return false;
  const trozo = limpia.slice(0, 40);
  return textos.some((t) => t.toLowerCase().replace(/\s+/g, " ").includes(trozo));
}

const DIA_SEMANA = (d: Date, tz: string) => new Intl.DateTimeFormat("es-AR", { timeZone: tz, weekday: "long" }).format(d);

export type EntradaVerificador = {
  acuerdo: Acuerdo | null;
  textos: string[]; // lo que dice la charla, para comprobar la frase
  turnosDelCliente: TurnoDelCliente[]; // activos (sin-confirmar / confirmado), a futuro
  ahora: Date;
  tz: string;
  // Domingos, feriados y días cerrados: viene resuelto de afuera (diasSinTurnos).
  diaSinTurnos: (diaYmd: string) => string | null;
};

export function verificar(e: EntradaVerificador): Decision {
  const a = e.acuerdo;
  if (!a) return { accion: "dudoso", motivo: "no se pudo leer la charla" };
  if (!a.hayAcuerdo) {
    return a.intencionSinHora
      ? { accion: "falta_datos", motivo: a.motivo || "el cliente quiere ir pero falta el día o la hora" }
      : { accion: "sin_acuerdo" };
  }
  if (!esDiaYHoraReal(a.dia, a.hora)) {
    return { accion: "falta_datos", motivo: `acuerdo sin día y hora completos (${a.dia ?? "sin día"} ${a.hora ?? "sin hora"})` };
  }
  if (!fraseEstaEnLaCharla(a.frase, e.textos)) {
    return { accion: "dudoso", motivo: `la frase que citó el lector no está en la charla: «${a.frase.slice(0, 60)}»` };
  }
  // El que acepta tiene que ser alguien: sin aceptación no hay acuerdo (la propuesta sola no alcanza).
  if (a.acepto === null) return { accion: "dudoso", motivo: "hay día y hora pero no queda claro que alguien lo haya aceptado" };

  const inicio = instanteLocal(a.dia!, a.hora!, e.tz);
  if (Number.isNaN(inicio.getTime())) return { accion: "dudoso", motivo: "día u hora que no se pudo interpretar" };
  if (inicio <= e.ahora) return { accion: "pasado", inicio };

  const cerrado = e.diaSinTurnos(a.dia!);
  if (cerrado) return { accion: "dudoso", motivo: `el ${DIA_SEMANA(inicio, e.tz)} ${a.dia}: ${cerrado}` };

  // Ya está cargado (misma hora, con un minuto de margen)
  if (e.turnosDelCliente.some((t) => Math.abs(t.inicio.getTime() - inicio.getTime()) < 60_000)) return { accion: "ya_esta", inicio };

  // Tiene otro turno a futuro: se mueve ese (decisión de Mateo, 14/10). Si tiene varios, no se sabe cuál.
  if (e.turnosDelCliente.length === 1) return { accion: "mover", inicio, turnoId: e.turnosDelCliente[0].id };
  if (e.turnosDelCliente.length > 1) {
    return { accion: "dudoso", motivo: `el cliente tiene ${e.turnosDelCliente.length} turnos a futuro y no se sabe cuál mover` };
  }
  return { accion: "cargar", inicio };
}
