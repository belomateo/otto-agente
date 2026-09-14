// Cuándo atiende el local y cuándo se dan turnos (decisión #7 de Mateo, 14/9):
//  · horarios: el horario del local (atención humana, avisos fuera de horario). Sus columnas
//    de corte ya no se usan para turnos.
//  · franjas_turnos (paneles, rango 0030–0039): las franjas en que se dan turnos, cada una con
//    su cantidad de probadores. En una franja con P probadores toman turnos los probadores 1 a
//    P (supuesto #22).
// Mientras franjas_turnos no exista, las franjas se sacan de horarios (de la apertura al
// cierre, partidas en el corte, con todos los probadores): es el comportamiento de antes y se
// deja de usar solo, en cuanto paneles crea la tabla.
//
// Dos usos, los dos código puro (AGENTE.md § 2): la última guarda antes de escribir un turno
// (principio 6: aunque el hueco venga de la agenda, si cae fuera de una franja se rechaza) y
// el horario en palabras para buscar_informacion. Ninguna hora está escrita acá.

import type { Db } from "../db.ts";
import { fechaLocal, MINUTOS_POR_HORA, minutosDelDia, nombreDia, partesLocales } from "../tiempo.ts";

export type HorarioLocal = { diaSemana: number; apertura: number; cierre: number };
export type Franja = { diaSemana: number; desde: number; hasta: number; probadores: number };

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

export async function leerHorarioDelLocal(db: Db): Promise<HorarioLocal[]> {
  const filas = await db.consulta(
    `select dia_semana, hora_apertura::text as apertura, hora_cierre::text as cierre
       from horarios where activo order by dia_semana`,
  );
  return filas.map((f) => ({
    diaSemana: Number(f.dia_semana),
    apertura: aMinutos(f.apertura) ?? 0,
    cierre: aMinutos(f.cierre) ?? 0,
  }));
}

export async function leerFranjas(db: Db): Promise<{ franjas: Franja[]; origen: "franjas_turnos" | "horarios" }> {
  const columnas = (await db.consulta(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'franjas_turnos'`,
  )).map((f) => String(f.column_name));
  if (columnas.length) {
    const filtro = columnas.includes("activo") ? "where activo" : "";
    const filas = await db.consulta(
      `select dia_semana, desde::text as desde, hasta::text as hasta, probadores
         from franjas_turnos ${filtro} order by dia_semana, desde`,
    );
    return {
      origen: "franjas_turnos",
      franjas: filas.map((f) => ({
        diaSemana: Number(f.dia_semana),
        desde: aMinutos(f.desde) ?? 0,
        hasta: aMinutos(f.hasta) ?? 0,
        probadores: Number(f.probadores),
      })),
    };
  }
  const filas = await db.consulta(
    `select h.dia_semana, h.hora_apertura::text as apertura, h.hora_cierre::text as cierre,
            h.corte_desde::text as corte_desde, h.corte_hasta::text as corte_hasta,
            (select cantidad_probadores from configuracion_agenda limit 1) as probadores
       from horarios h where h.activo order by h.dia_semana`,
  );
  const franjas: Franja[] = [];
  for (const f of filas) {
    const dia = Number(f.dia_semana);
    const apertura = aMinutos(f.apertura) ?? 0;
    const cierre = aMinutos(f.cierre) ?? 0;
    const corteDesde = aMinutos(f.corte_desde);
    const corteHasta = aMinutos(f.corte_hasta);
    const probadores = Number(f.probadores ?? 0);
    if (corteDesde !== null && corteHasta !== null && apertura < corteDesde && corteHasta < cierre) {
      franjas.push({ diaSemana: dia, desde: apertura, hasta: corteDesde, probadores });
      franjas.push({ diaSemana: dia, desde: corteHasta, hasta: cierre, probadores });
    } else {
      franjas.push({ diaSemana: dia, desde: apertura, hasta: cierre, probadores });
    }
  }
  return { origen: "horarios", franjas };
}

const unirFranjas = (fs: { desde: number; hasta: number }[]) =>
  fs.map((f) => `de ${paraLeer(f.desde)} a ${paraLeer(f.hasta)}`).join(" y ");

// ¿El turno [inicio, fin) entra entero en una franja de ese día? Si viene el probador, además
// tiene que ser uno de los que toman turnos en esa franja.
export function dentroDeFranja(
  inicio: Date,
  fin: Date,
  franjas: Franja[],
  tz: string,
  probador?: number,
): { ok: true; franja: Franja } | { ok: false; motivo: string } {
  if (!(fin > inicio)) return { ok: false, motivo: "el turno termina antes de empezar" };
  if (fechaLocal(inicio, tz) !== fechaLocal(fin, tz)) return { ok: false, motivo: "el turno termina otro día" };
  const dia = partesLocales(inicio, tz).diaSemana;
  const delDia = franjas.filter((f) => f.diaSemana === dia).sort((a, b) => a.desde - b.desde);
  if (delDia.length === 0) return { ok: false, motivo: `los ${plural(nombreDia(dia))} no se dan turnos` };
  const a = minutosDelDia(inicio, tz);
  const b = minutosDelDia(fin, tz);
  const franja = delDia.find((f) => a >= f.desde && b <= f.hasta);
  if (!franja) return { ok: false, motivo: `el ${nombreDia(dia)} los turnos son ${unirFranjas(delDia)}` };
  if (probador !== undefined && probador > franja.probadores) {
    return {
      ok: false,
      motivo: `en esa franja toman turnos ${franja.probadores} probadores y el hueco era del probador ${probador}`,
    };
  }
  return { ok: true, franja };
}

const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

function nombreDeDias(dias: number[]): string {
  const primero = nombreDia(dias[0]);
  const ultimo = nombreDia(dias[dias.length - 1]);
  if (dias.length === 1) return mayuscula(plural(primero));
  if (dias.length === 2) return `${mayuscula(plural(primero))} y ${plural(ultimo)}`;
  return `${mayuscula(primero)} a ${ultimo}`;
}

// Una frase por grupo de días seguidos que tienen el mismo detalle.
function frases(detalle: (dia: number) => string | null, vacio: string): string {
  const grupos: { dias: number[]; texto: string | null }[] = [];
  for (const d of ORDEN_SEMANA) {
    const t = detalle(d);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === t) ultimo.dias.push(d);
    else grupos.push({ dias: [d], texto: t });
  }
  return grupos.map((g) => `${nombreDeDias(g.dias)}, ${g.texto ?? vacio}`).join(". ") + ".";
}

// El horario del local y el de los turnos en palabras, y todas las horas que aparecen (para la
// barandilla de horarios: si Lucía las dice, salieron de una herramienta).
export function describirHorarios(local: HorarioLocal[], franjas: Franja[]): { local: string; turnos: string; horas: string[] } {
  const horas = new Set<string>();
  for (const h of local) {
    horas.add(normalizada(h.apertura));
    horas.add(normalizada(h.cierre));
  }
  for (const f of franjas) {
    horas.add(normalizada(f.desde));
    horas.add(normalizada(f.hasta));
  }
  const textoLocal = frases((d) => {
    const h = local.find((x) => x.diaSemana === d);
    return h ? `de ${paraLeer(h.apertura)} a ${paraLeer(h.cierre)}` : null;
  }, "cerrado");
  const textoTurnos = frases((d) => {
    const fs = franjas.filter((f) => f.diaSemana === d).sort((a, b) => a.desde - b.desde);
    return fs.length ? unirFranjas(fs) : null;
  }, "sin turnos");
  return { local: textoLocal, turnos: textoTurnos, horas: [...horas] };
}
