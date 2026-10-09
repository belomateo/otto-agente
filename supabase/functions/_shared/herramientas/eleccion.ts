// ¿El cliente eligió este horario? (8/10) — la guarda de agendar_turno y reprogramar_turno.
//
// Casos reales del 8/10: un cliente preguntó si el feriado trabajaban y Lucía le reservó un
// horario que no había elegido; otro contó «llegaron a instalar una máquina» y le movió el turno
// a otro día sin preguntarle. Las dos herramientas ya exigían que el hueco
// saliera de buscar_horarios en el turno, pero nada miraba si el CLIENTE lo había elegido.
//
// Se acepta (en este orden):
//  1. el cliente nombra esa hora en la ráfaga («15.15», «1530», «a las 3», «3 y media»);
//  2. pide la misma hora que ya tenía («¿podemos pasarlo a mañana a la misma hora?»);
//  3. dice que sí (o «el primero», «el martes»…) a lo que Lucía le ofreció en su mensaje anterior,
//     y ese día y hora estaban ahí: si le había ofrecido varios, el «sí» solo no alcanza — tiene
//     que decir cuál (la hora, «el primero/segundo», o el día si ese día había uno solo).
// Lo que no es elegir: una pregunta que no nombra la hora, un comentario o un reparo. Caso real
// (8/10, repitiendo la charla): le ofreció un horario el lunes 12 y otro el martes 13, la clienta
// contestó «Pero el lunes / Es feriado» y se reservaba el lunes porque nombraba el día.
// Un rechazo de acá no deriva: el modelo lee el mensaje y le pregunta al cliente si confirma.

import { horas } from "../barandillas/chequeos/horario_sin_herramienta.ts";
import { normalizar } from "../barandillas/texto.ts";
import { fechaLarga, horaLocal, nombreDia, partesLocales } from "../tiempo.ts";
import type { ContextoHerramienta } from "./tipos.ts";

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
// Nadie pide turno de madrugada: un «3» o un «7» suelto es de la tarde.
const deLaTarde = (h: number) => (h >= 1 && h <= 8 ? h + 12 : h);

// Las horas que nombra un texto, en minutos desde medianoche.
export function horasNombradas(crudo: string): number[] {
  // «rosario.13.15» (caso real): el punto pegado a una palabra no es parte de la hora.
  const texto = crudo.replace(/(\p{L})\.(?=\d)/gu, "$1. ");
  const n = normalizar(texto);
  const res = new Set<number>();
  for (const h of horas(texto)) {
    const [hh, mm] = h.split(":").map(Number);
    res.add(deLaTarde(hh) * 60 + mm);
  }
  // «1530», «1145», «930»: solo con minutos de agenda (00/15/30/45), así un año o un precio no cuentan.
  for (const x of n.matchAll(/(?<![\d.,:$])([01]?\d|2[0-3])(00|15|30|45)(?![\d.,])/g)) res.add(deLaTarde(Number(x[1])) * 60 + Number(x[2]));
  // «las 3», «las 17» sin el «a» adelante.
  for (const x of n.matchAll(/\blas?\s+([01]?\d|2[0-3])\b(?!\s*[:.]\d|\s+(?:personas?|de\s+(?:la\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)))/g)) {
    res.add(deLaTarde(Number(x[1])) * 60);
  }
  // «3 y media», «11 y cuarto», «4 menos cuarto».
  for (const x of n.matchAll(/\b([01]?\d|2[0-3])\s+y\s+(media|cuarto)\b/g)) res.add(deLaTarde(Number(x[1])) * 60 + (x[2] === "media" ? 30 : 15));
  for (const x of n.matchAll(/\b([01]?\d|2[0-3])\s+menos\s+cuarto\b/g)) res.add(deLaTarde(Number(x[1])) * 60 - 15);
  return [...res];
}

const SI = /\b(?:si|sii|dale|ok|okay|oka|okey|perfecto|perfecta|listo|bueno|genial|joya|barbaro|excelente|buenisimo|de una|me sirve|me queda|me viene|ese|esa|confirmo|confirmado|reserva\w*|agenda\w*|anotame|va)\b/;
const ORDINAL = /\b(primer\w*|segund\w*|ultim\w*)\b/;
// Un reparo no es elegir, aunque nombre el día («pero el lunes», «es feriado», «no puedo»).
const REPARO = /\b(?:pero|feriado|imposible|no (?:puedo|podemos|puede|llego|me (?:sirve|queda|viene))|complica\w*|complicad\w*)\b/;
const DIAS = "lunes|martes|miercoles|jueves|viernes|sabado|domingo";

// Lo que le ofrecimos, en orden: cada hora con el día que la precede («el jueves 6 a las 11 o el
// sábado 8 a las 17» → jueves 6 a las 11, sábado 8 a las 17). Una hora sin día nombrado antes
// queda con día null y vale para cualquiera.
type Oferta = { dia: string | null; numero: number | null; minutos: number };
export function ofertasEn(nuestro: string): Oferta[] {
  const res: Oferta[] = [];
  for (const tramo of normalizar(nuestro).split(new RegExp(`(?=\\b(?:${DIAS})\\b)`))) {
    const d = tramo.match(new RegExp(`^(${DIAS})(?:\\s+(\\d{1,2})\\b(?![:.]\\d))?`));
    const dia = d?.[1] ?? null;
    const numero = d?.[2] ? Number(d[2]) : null;
    for (const minutos of horasNombradas(d ? tramo.slice(d[0].length) : tramo)) {
      if (!res.some((o) => o.dia === dia && o.numero === numero && o.minutos === minutos)) res.push({ dia, numero, minutos });
    }
  }
  return res;
}

type Ultimos = { rafaga: string; nuestro: string };

// La ráfaga del cliente (todo lo entrante desde la última respuesta) y lo último que le dijimos
// (los mensajes salientes entre su mensaje anterior y esa respuesta).
async function leerUltimos(ctx: ContextoHerramienta): Promise<Ultimos> {
  const [f] = await ctx.db.consulta<{ rafaga: string | null; nuestro: string | null }>(
    `with ult_sal as (select max(enviado_at) as t from mensajes where conversacion_id = $1::uuid and direccion = 'saliente'),
          ent_prev as (select max(enviado_at) as t from mensajes where conversacion_id = $1::uuid and direccion = 'entrante'
                        and enviado_at < coalesce((select t from ult_sal), '-infinity'::timestamptz))
     select
       (select string_agg(concat_ws(' ', contenido, transcripcion), ' ' order by enviado_at) from mensajes
         where conversacion_id = $1::uuid and direccion = 'entrante'
           and enviado_at > coalesce((select t from ult_sal), '-infinity'::timestamptz)) as rafaga,
       (select string_agg(contenido, ' ' order by enviado_at) from mensajes
         where conversacion_id = $1::uuid and direccion = 'saliente'
           and enviado_at > coalesce((select t from ent_prev), '-infinity'::timestamptz)
           and enviado_at <= coalesce((select t from ult_sal), '-infinity'::timestamptz)) as nuestro`,
    [ctx.conversacionId],
  );
  return { rafaga: f?.rafaga ?? "", nuestro: f?.nuestro ?? "" };
}

export type Eleccion = { ok: true } | { ok: false; motivo: string };

export async function eligioElHorario(ctx: ContextoHerramienta, inicio: Date, horaQueYaTenia?: Date): Promise<Eleccion> {
  const { rafaga, nuestro } = await leerUltimos(ctx);
  if (!rafaga.trim()) return { ok: true }; // sin ráfaga no hay con qué comparar: no se frena
  const minutos = aMinutos(horaLocal(inicio, ctx.tz));
  const n = normalizar(rafaga);
  const cuando = `${fechaLarga(inicio, ctx.tz)} a las ${horaLocal(inicio, ctx.tz)}`;
  const preguntale = `No reserves todavía: preguntale si confirma, por ejemplo «¿Te reservo el ${cuando}?».`;

  if (horasNombradas(rafaga).includes(minutos)) return { ok: true };
  if (horaQueYaTenia && /\bmism[oa]\s+(?:hora|horario)\b/.test(n) && horaLocal(horaQueYaTenia, ctx.tz) === horaLocal(inicio, ctx.tz)) {
    return { ok: true };
  }
  if (/[?¿]/.test(rafaga)) {
    return { ok: false, motivo: `El cliente hizo una pregunta y no nombró ese horario: contestale lo que preguntó. ${preguntale}` };
  }
  const partes = partesLocales(inicio, ctx.tz);
  const dia = normalizar(nombreDia(partes.diaSemana));
  const ofertas = ofertasEn(nuestro);
  const esEsta = (o: Oferta) =>
    o.minutos === minutos && (o.dia === null || o.dia === dia) && (o.numero === null || o.numero === partes.dia);
  if (ofertas.some(esEsta)) {
    if (REPARO.test(n)) {
      return { ok: false, motivo: `El cliente puso un reparo y no eligió ese horario: contestale eso primero. ${preguntale}` };
    }
    const nombraSemana = new RegExp(`\\b${dia}\\b`).test(n);
    const nombraNumero = new RegExp(`\\b(?:el|dia)\\s+${partes.dia}\\b`).test(n);
    const nombraElDia = nombraSemana || nombraNumero;
    const ordinal = n.match(ORDINAL)?.[1];
    if (SI.test(n) || nombraElDia || ordinal) {
      if (ofertas.length === 1) return { ok: true };
      // El día elige solo si ese día le ofrecimos un horario solo.
      const deEseDia = ofertas.filter((o) =>
        (!nombraSemana || o.dia === null || o.dia === dia) && (!nombraNumero || o.numero === null || o.numero === partes.dia)
      );
      if (nombraElDia && deEseDia.length === 1 && esEsta(deEseDia[0])) return { ok: true };
      if (ordinal) {
        const elegida = ofertas[ordinal.startsWith("primer") ? 0 : ordinal.startsWith("segund") ? 1 : ofertas.length - 1];
        if (elegida && esEsta(elegida)) return { ok: true };
      }
      return { ok: false, motivo: `Le ofreciste más de un horario y no dijo cuál: preguntale cuál prefiere. ${preguntale}` };
    }
  }
  return { ok: false, motivo: `El cliente todavía no eligió ese horario (no lo nombró ni lo aceptó). ${preguntale}` };
}
