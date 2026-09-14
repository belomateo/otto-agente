// Horario laboral de Mr Otto, leído de la tabla horarios (el dueño lo edita en Configuración ›
// Agenda). Dos usos, los dos código puro (AGENTE.md § 2):
//  · dentroDeHorario: la última guarda antes de escribir un turno. Aunque el hueco venga de
//    buscar_horarios, si queda fuera del horario vigente se rechaza (principio 6).
//  · describirHorario: el horario en palabras, para que buscar_informacion lo devuelva desde la
//    tabla y no desde un fragmento que se desactualiza el día que cambie.
// Ninguna hora está escrita acá: todas salen de la tabla.

import type { Db } from "../db.ts";
import { fechaLocal, MINUTOS_POR_HORA, minutosDelDia, nombreDia, partesLocales } from "../tiempo.ts";

export type FilaHorario = {
  diaSemana: number; // 0 domingo … 6 sábado
  apertura: number; // minutos desde medianoche
  cierre: number;
  corteDesde: number | null;
  corteHasta: number | null;
};

function aMinutos(t: unknown): number | null {
  if (t === null || t === undefined) return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * MINUTOS_POR_HORA + m;
}

const dos = (n: number) => String(n).padStart(2, "0");
// Minutos desde medianoche → "h:mm" para leer, "hh:mm" para comparar con lo que escribió Lucía.
const paraLeer = (min: number) => `${Math.floor(min / MINUTOS_POR_HORA)}:${dos(min % MINUTOS_POR_HORA)}`;
const normalizada = (min: number) => `${dos(Math.floor(min / MINUTOS_POR_HORA))}:${dos(min % MINUTOS_POR_HORA)}`;
const plural = (dia: string) => (dia.endsWith("s") ? dia : `${dia}s`);
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function leerHorarios(db: Db): Promise<FilaHorario[]> {
  const filas = await db.consulta<{
    dia_semana: number;
    hora_apertura: string;
    hora_cierre: string;
    corte_desde: string | null;
    corte_hasta: string | null;
  }>(
    `select dia_semana, hora_apertura::text, hora_cierre::text, corte_desde::text, corte_hasta::text
       from horarios where activo order by dia_semana`,
  );
  return filas.map((f) => ({
    diaSemana: Number(f.dia_semana),
    apertura: aMinutos(f.hora_apertura) ?? 0,
    cierre: aMinutos(f.hora_cierre) ?? 0,
    corteDesde: aMinutos(f.corte_desde),
    corteHasta: aMinutos(f.corte_hasta),
  }));
}

export function dentroDeHorario(
  inicio: Date,
  fin: Date,
  horarios: FilaHorario[],
  tz: string,
): { ok: true } | { ok: false; motivo: string } {
  if (!(fin > inicio)) return { ok: false, motivo: "el turno termina antes de empezar" };
  if (fechaLocal(inicio, tz) !== fechaLocal(fin, tz)) return { ok: false, motivo: "el turno termina otro día" };
  const dia = partesLocales(inicio, tz).diaSemana;
  const h = horarios.find((x) => x.diaSemana === dia);
  if (!h) return { ok: false, motivo: `el local no atiende los ${plural(nombreDia(dia))}` };
  const a = minutosDelDia(inicio, tz);
  const b = minutosDelDia(fin, tz);
  if (a < h.apertura || b > h.cierre) {
    return { ok: false, motivo: `el ${nombreDia(dia)} se atiende de ${paraLeer(h.apertura)} a ${paraLeer(h.cierre)}` };
  }
  if (h.corteDesde !== null && h.corteHasta !== null && a < h.corteHasta && b > h.corteDesde) {
    return { ok: false, motivo: `el ${nombreDia(dia)} hay corte de ${paraLeer(h.corteDesde)} a ${paraLeer(h.corteHasta)}` };
  }
  return { ok: true };
}

const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

// El horario en una frase por grupo de días ("Lunes a viernes, de … a …, con corte de … a ….
// Sábados, de … a …. Domingos, cerrado.") y la lista de horas, para la barandilla de horarios.
export function describirHorario(horarios: FilaHorario[]): { texto: string; horas: string[] } {
  const de = (d: number) => horarios.find((x) => x.diaSemana === d) ?? null;
  const firma = (d: number) => {
    const h = de(d);
    return h ? `${h.apertura}|${h.cierre}|${h.corteDesde}|${h.corteHasta}` : "cerrado";
  };
  const grupos: { dias: number[]; firma: string }[] = [];
  for (const d of ORDEN_SEMANA) {
    const f = firma(d);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.firma === f) ultimo.dias.push(d);
    else grupos.push({ dias: [d], firma: f });
  }
  const horas = new Set<string>();
  const frases = grupos.map((g) => {
    const primero = nombreDia(g.dias[0]);
    const ultimo = nombreDia(g.dias[g.dias.length - 1]);
    const dias = g.dias.length === 1
      ? mayuscula(plural(primero))
      : g.dias.length === 2
      ? `${mayuscula(plural(primero))} y ${plural(ultimo)}`
      : `${mayuscula(primero)} a ${ultimo}`;
    const h = de(g.dias[0]);
    if (!h) return `${dias}, cerrado`;
    for (const m of [h.apertura, h.cierre, h.corteDesde, h.corteHasta]) if (m !== null) horas.add(normalizada(m));
    const corte = h.corteDesde !== null && h.corteHasta !== null
      ? `, con corte de ${paraLeer(h.corteDesde)} a ${paraLeer(h.corteHasta)}`
      : "";
    return `${dias}, de ${paraLeer(h.apertura)} a ${paraLeer(h.cierre)}${corte}`;
  });
  return { texto: frases.join(". ") + ".", horas: [...horas] };
}
