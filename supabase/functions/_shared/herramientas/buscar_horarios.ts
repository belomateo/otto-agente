// buscar_horarios(desde, hasta, tipo_turno, fecha_evento?) — huecos reales de la agenda
// (AGENTE.md § 4). Los huecos los calcula la agenda (logica, H1.13) por probador y duración,
// dentro de las franjas de turnos y por orden de urgencia (decisiones #7 y #9). Acá:
//  · con el evento hoy, mañana o pasado mañana no se ofrece nada: se deriva en código con motivo
//    evento_inminente (decisión #8), lo diga la fecha o lo diga la agenda;
//  · se vuelve a descartar lo que quede en el pasado o fuera de una franja (o en un probador
//    que no toma turnos en esa franja);
//  · se agrupa por hora (el modelo no elige probador) y se eligen unos pocos por día, de TODOS
//    los días del rango que tienen lugar, para que Lucía ofrezca dos;
//  · si en lo pedido no hay lugar, busca sola los días más cercanos y los devuelve como
//    alternativas, diciendo por qué esos días no (completo, feriado, cerrado, pegado al evento).
//    Pasar la charla queda para cuando tampoco hay lugar ahí (10/10).
// Lo que se le muestra al modelo queda en la traza: es lo único que agendar_turno y
// cambiar_turno aceptan en este turno.

import { diasSinTurnos } from "../agenda/huecos.ts";
import type { Db } from "../db.ts";
import { TIPOS_TURNO, type TipoTurno } from "../enums.ts";
import {
  diasEntre,
  fechaLarga,
  fechaLocal,
  horaLocal,
  isoLocal,
  MINUTOS_POR_HORA,
  minutosDelDia,
  partesLocales,
  sumarDias,
} from "../tiempo.ts";
import { derivarPorEventoInminente, esEventoInminente } from "./derivacion.ts";
import { turnoActivoDelCliente } from "./turnos.ts";
import { fechaEventoCreible } from "./fecha_evento.ts";
import { actualizarFicha, leerFicha } from "./ficha.ts";
import { dentroDeFranja, type Franja, leerFranjas } from "./horario_laboral.ts";
import { type ContextoHerramienta, type Herramienta, type Hueco, objeto, rechazo } from "./tipos.ts";

type Args = {
  desde: string;
  hasta: string;
  tipo_turno: TipoTurno | null;
  fecha_evento: string | null;
  fecha_hora?: string | null;
  desde_hora?: string | null;
  hasta_hora?: string | null;
};

const HORA_HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const aMinutos = (hm: string) => Number(hm.slice(0, 2)) * MINUTOS_POR_HORA + Number(hm.slice(3, 5));

const RANGO_MAXIMO_DIAS = 13; // dos semanas por consulta
const MEDIODIA = 13 * MINUTOS_POR_HORA; // antes de la una se dice "a la mañana"
// Por día, dos opciones a la mañana y dos a la tarde, de TODOS los días del rango que tienen lugar.
// Hasta el 10/10 había además un tope de 16 opciones en total que se llenaba con los primeros cuatro
// días: en un rango de dos semanas los últimos no aparecían y Lucía los daba por llenos. Caso real
// (Mateo, 10/10): a un cliente le dijo que el sábado 17 no había lugar, y estaba libre. Sin tope,
// dos semanas son como mucho 56 opciones; Lucía igual ofrece dos.
const POR_FRANJA = 2;
// Lo pedido sin lugar (10/10): de lo más cercano se devuelven los primeros tres días con lugar.
const DIAS_ALTERNATIVOS = 3;

// Dos personas por turno (Mateo, 2/10): en un turno normal pueden probarse dos. Antes esto decía
// "doble si vienen dos" y, con un cliente que quería sumar a alguien a su turno, Lucía buscó un
// doble de hora y media en ese horario, no lo encontró y derivó por dato_no_encontrado.
// 27/10 (Sofía vía Mateo): al revés otra vez, dos que se prueban son un doble de 90 minutos; sumar a
// alguien es mover el turno a doble con cambiar_turno.
export const buscarHorarios: Herramienta<Args> = {
  nombre: "buscar_horarios",
  tipo: "consulta",
  descripcion: "Devuelve huecos reales para un turno en el local entre dos fechas, ya filtrados por las franjas " +
    "de turnos y los probadores libres, con los eventos más cercanos primero. Obligatoria antes de ofrecer un día " +
    "u hora, y otra vez justo antes de agendar_turno o de mover un turno con cambiar_turno, en el mismo turno. De lo que devuelve " +
    "ofrecé dos, nunca más de tres. Si esos días no tienen lugar, busca sola los más cercanos y los devuelve en " +
    "alternativas. tipo_turno: graduado, novio o invitado según quién se viste. Si se prueban dos personas, doble " +
    "(90 minutos); si son tres, triple. Un acompañante que no se prueba no cuenta. Para sumar a alguien a un turno que ya " +
    "tiene, buscá con doble (o triple) a esa misma hora con fecha_hora y movelo con cambiar_turno y el tipo nuevo. prueba_final solo para la prueba del día " +
    "anterior al evento (también para retirar el traje): mandá la fecha del evento y el día y los horarios los pone " +
    "la agenda (el último día abierto antes del evento, en el horario de prueba final); no ofrezcas otro día. Mandá la fecha " +
    "del evento si la sabés. Si el evento es hoy, mañana o pasado mañana, no devuelve huecos: el sistema le pasa solo el teléfono " +
    "del local para que lo resuelva directo, y vos no escribís nada más. Pedí como mucho dos semanas por vez. Si el cliente eligió día y hora, " +
    "mandalos en fecha_hora: se comprueba ese horario exacto y no se pide mail. Si está libre, ejecutá " +
    "agendar_turno inmediatamente. Si no conocés el tipo, mandá null: usa la duración de invitado.",
  parametros: objeto({
    desde: { type: "string", format: "date", description: "Primer día a mirar, AAAA-MM-DD." },
    hasta: { type: "string", format: "date", description: "Último día a mirar, AAAA-MM-DD." },
    tipo_turno: { type: ["string", "null"], enum: [...TIPOS_TURNO, null], description: "Tipo de turno, o null si no se conoce." },
    fecha_hora: { type: ["string", "null"], format: "date-time", description: "Fecha y hora exactas elegidas por el cliente, con zona. null si solo busca opciones." },
    // Franja pedida (FAQ del 3/10): de los huecos solo se mostraban los dos primeros de la mañana
    // y los dos primeros de la tarde (la una y la una y cuarto), así que "después de las 16" o "última hora"
    // nunca aparecían y Lucía derivaba; 6 de los 8 turnos que dio el equipo eran de semana después
    // de las 14.
    desde_hora: {
      type: ["string", "null"],
      description: "Si pidió una franja («después de las 16», «a partir de las dos», «última hora»), la primera " +
        "hora de inicio que le sirve, HH:MM en 24 h. Para «última hora», una hora y media antes del cierre. null si no.",
    },
    hasta_hora: {
      type: ["string", "null"],
      description: "Si pidió «antes de las 15» o «a la mañana», la hora antes de la que tiene que empezar, HH:MM en " +
        "24 h. null si no.",
    },
    fecha_evento: {
      type: ["string", "null"],
      format: "date",
      description: "Fecha del evento, AAAA-MM-DD, si el cliente dijo el día exacto (si ya está en su libreta, podés mandarla igual). Con solo el mes, null. «Un 15» es la fiesta de quince, no el día 15.",
    },
  }),
  async ejecutar(args, ctx) {
    args = { ...args, fecha_evento: await fechaEventoCreible(ctx, args.fecha_evento) };
    const tipo = args.tipo_turno ?? "invitado";
    const elegido = args.fecha_hora ? new Date(args.fecha_hora) : null;
    const hoy = fechaLocal(ctx.ahora, ctx.tz);
    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    const fechaEvento = args.fecha_evento ?? ficha.fecha_evento;
    if (fechaEvento) ctx.traza.reservaSinFechaEvento = false; // ya la sabe: el freno de abajo no aplica
    if (fechaEvento && fechaEvento < hoy) {
      return rechazo("fecha_evento_pasada", `La fecha del evento (${fechaEvento}) ya pasó. Confirmala con el cliente.`);
    }
    // 29/10 (Emi): evento cerca y ya tiene turno → se buscan horarios para MOVERLO, hasta el día antes
    // del evento. Un turno nuevo con el evento cerca sigue yendo al equipo.
    const paraMover = esEventoInminente(fechaEvento, ctx.ahora, ctx.tz) && (await turnoActivoDelCliente(ctx.db, ctx.cliente.id, ctx.ahora)) !== null;
    if (esEventoInminente(fechaEvento, ctx.ahora, ctx.tz) && !paraMover) {
      if (args.fecha_evento) await actualizarFicha(ctx.db, ctx.cliente.id, { fecha_evento: args.fecha_evento });
      return await derivarPorEventoInminente(ctx);
    }

    const avisos: string[] = [];
    let desde = args.desde;
    if (desde < hoy) {
      desde = hoy;
      avisos.push("desde era un día que ya pasó: se buscó desde hoy.");
    }
    if (args.hasta < desde) {
      return rechazo("rango_invertido", "hasta es anterior a desde (o ya pasó). Pedí un rango que termine hoy o después.");
    }
    // Más de dos semanas: se recorta y se avisa, en vez de rechazar. El modelo pedía "dos semanas"
    // contando 15 días y perdía una vuelta entera (4 rechazos en las últimas 30 charlas; a un
    // cliente le preguntó "qué día te queda cómodo" en vez de ofrecerle horarios).
    let hasta = paraMover && fechaEvento && args.hasta >= fechaEvento ? sumarDias(fechaEvento, -1) : args.hasta;
    if (paraMover && hasta < desde) return await derivarPorEventoInminente(ctx);
    if (diasEntre(desde, hasta) > RANGO_MAXIMO_DIAS) {
      hasta = sumarDias(desde, RANGO_MAXIMO_DIAS);
      avisos.push(`se buscó hasta ${hasta}: dos semanas por vez.`);
    }
    if (elegido && (!(elegido > ctx.ahora) || fechaLocal(elegido, ctx.tz) < desde || fechaLocal(elegido, ctx.tz) > hasta)) {
      return rechazo("fecha_hora_fuera_de_rango", "La fecha y hora elegidas deben ser futuras y estar dentro del rango consultado.");
    }
    for (const h of [args.desde_hora, args.hasta_hora]) {
      if (h && !HORA_HM.test(h)) return rechazo("hora_invalida", `${h} no es una hora válida: mandala como HH:MM, en 24 h.`);
    }
    const desdeMin = args.desde_hora ? aMinutos(args.desde_hora) : null;
    const hastaMin = args.hasta_hora ? aMinutos(args.hasta_hora) : null;

    ctx.traza.rangosBuscados.push({ desde, hasta });

    const agenda = await ctx.agenda.huecos({
      desde,
      hasta,
      tipo,
      ahora: ctx.ahora,
      fechaEvento: paraMover ? null : fechaEvento,
    });
    if (agenda.derivar === "evento_inminente") return await derivarPorEventoInminente(ctx);

    const { franjas } = await leerFranjas(ctx.db);
    const validos = validosPorInicio(agenda.huecos, desde, hasta, franjas, ctx);
    const porInicio = enLaFranjaPedida(validos.porInicio, desdeMin, hastaMin, elegido, ctx.tz);

    // La elección del cliente no puede desaparecer al resumir las primeras opciones del día: si
    // está libre, es lo único que se devuelve.
    const elegidos = elegido && porInicio.has(elegido.getTime())
      ? [elegido.getTime()]
      : resumirPorDia([...porInicio.keys()], ctx.tz);
    const huecos = ofrecer(ctx, elegidos, porInicio, tipo);

    const datos: Record<string, unknown> = { tipo_turno: tipo, huecos };
    if (elegido) {
      datos.horario_elegido_disponible = porInicio.has(elegido.getTime());
      if (huecos.length > 0) {
        datos.nota = datos.horario_elegido_disponible
          ? "El horario elegido está libre. Agendá ahora con el teléfono de la charla, aunque falten nombre o correo; no pidas datos adicionales ni otra confirmación."
          : "El horario que eligió no está disponible. No derives: ofrecé los horarios más cercanos de la lista y preguntale cuál le queda bien.";
      }
    }
    if (paraMover && huecos.length === 0) return await derivarPorEventoInminente(ctx); // no hay dónde moverlo antes del evento
    if (huecos.length === 0) {
      Object.assign(
        datos,
        await sinLugarEnLoPedido(ctx, {
          desde,
          hasta,
          hoy,
          tipo,
          fechaEvento,
          franjas,
          desdeMin,
          hastaMin,
          hayLugarFueraDeLaFranja: validos.porInicio.size > 0,
          ultimoDiaAntesDelEvento: agenda.ultimoDiaAntesDelEvento ?? null,
          eligioUnHorario: elegido !== null,
        }),
      );
    }
    if (avisos.length) datos.aviso = avisos.join(" ");
    if (validos.descartados) datos.descartados_fuera_de_horario = validos.descartados;
    // Nombre/correo se piden en el resumen posterior a reservar, nunca al buscar.
    return { ok: true, datos };
  },
};

type Valido = { inicio: Date; fin: Date; probador: number };
type Ofrecido = { fecha_hora: string; dia: string; hora: string; franja: "mañana" | "tarde" };

const franjaDelDia = (d: Date, tz: string): Ofrecido["franja"] => (minutosDelDia(d, tz) < MEDIODIA ? "mañana" : "tarde");

// Los huecos de la agenda que de verdad se pueden ofrecer en [desde, hasta]: que no hayan pasado y
// que entren en una franja (el mismo control que hace agendar_turno), agrupados por hora de inicio.
function validosPorInicio(
  lista: Hueco[],
  desde: string,
  hasta: string,
  franjas: Franja[],
  ctx: ContextoHerramienta,
): { porInicio: Map<number, Valido[]>; descartados: number } {
  const porInicio = new Map<number, Valido[]>();
  let descartados = 0;
  for (const h of lista) {
    const inicio = new Date(h.inicio);
    const fin = new Date(h.fin);
    const valido = !Number.isNaN(inicio.getTime()) && inicio > ctx.ahora &&
      fechaLocal(inicio, ctx.tz) >= desde && fechaLocal(inicio, ctx.tz) <= hasta &&
      dentroDeFranja(inicio, fin, franjas, ctx.tz, h.probador).ok;
    if (!valido) {
      descartados++;
      continue;
    }
    const k = inicio.getTime();
    porInicio.set(k, [...(porInicio.get(k) ?? []), { inicio, fin, probador: h.probador }]);
  }
  return { porInicio, descartados };
}

// La franja pedida (desde_hora/hasta_hora). No filtra el horario exacto que eligió el cliente: ese
// se comprueba igual.
function enLaFranjaPedida(
  porInicio: Map<number, Valido[]>,
  desdeMin: number | null,
  hastaMin: number | null,
  elegido: Date | null,
  tz: string,
): Map<number, Valido[]> {
  if (desdeMin === null && hastaMin === null) return porInicio;
  const res = new Map<number, Valido[]>();
  for (const [k, v] of porInicio) {
    const minutos = minutosDelDia(new Date(k), tz);
    const fuera = (desdeMin !== null && minutos < desdeMin) || (hastaMin !== null && minutos >= hastaMin);
    if (!fuera || (elegido && k === elegido.getTime())) res.set(k, v);
  }
  return res;
}

// De cada día, las primeras POR_FRANJA horas de la mañana y las primeras de la tarde, en orden. Sin
// tope en total: ningún día con lugar queda afuera (ver POR_FRANJA).
export function resumirPorDia(inicios: number[], tz: string): number[] {
  const porFranja = new Map<string, number>();
  const elegidos: number[] = [];
  for (const k of [...inicios].sort((a, b) => a - b)) {
    const d = new Date(k);
    const clave = `${fechaLocal(d, tz)}|${franjaDelDia(d, tz)}`;
    const n = porFranja.get(clave) ?? 0;
    if (n >= POR_FRANJA) continue;
    porFranja.set(clave, n + 1);
    elegidos.push(k);
  }
  return elegidos;
}

// Lo que se le muestra al modelo, y a la traza con todos los probadores libres a esa hora: es lo
// único que agendar_turno y cambiar_turno aceptan, y las horas que horario_sin_herramienta deja decir.
function ofrecer(ctx: ContextoHerramienta, elegidos: number[], porInicio: Map<number, Valido[]>, tipo: TipoTurno): Ofrecido[] {
  for (const k of elegidos) {
    for (const h of porInicio.get(k) ?? []) {
      ctx.traza.huecosOfrecidos.push({ inicio: h.inicio.toISOString(), fin: h.fin.toISOString(), probador: h.probador, tipo });
    }
  }
  const lista = elegidos.map((k) => {
    const d = new Date(k);
    return { fecha_hora: isoLocal(d, ctx.tz), dia: fechaLarga(d, ctx.tz), hora: horaLocal(d, ctx.tz), franja: franjaDelDia(d, ctx.tz) };
  });
  ctx.traza.horasDevueltas.push(...lista.map((h) => h.hora));
  return lista;
}

type PedidoSinLugar = {
  desde: string;
  hasta: string;
  hoy: string;
  tipo: TipoTurno;
  fechaEvento: string | null;
  franjas: Franja[];
  desdeMin: number | null;
  hastaMin: number | null;
  hayLugarFueraDeLaFranja: boolean;
  ultimoDiaAntesDelEvento: string | null;
  eligioUnHorario: boolean;
};

const NOTA_FRANJA = "En esa franja no quedó lugar esos días. No derives ni digas que no hay lugar: buscá de nuevo " +
  "sin desde_hora ni hasta_hora y ofrecé los horarios más cercanos a lo que pidió.";

// En lo pedido no hay lugar. Pedido de Mateo (10/10): Lucía pasaba la charla después de mirar un
// solo día, y el equipo le daba otro. Ahora la herramienta busca sola lo más cercano y lo devuelve
// en alternativas, con el porqué de esos días; pasar la charla queda para cuando tampoco hay lugar
// en lo más cercano (la agenda llena por semanas, o nada antes del evento).
async function sinLugarEnLoPedido(ctx: ContextoHerramienta, p: PedidoSinLugar): Promise<Record<string, unknown>> {
  const conFranja = p.desdeMin !== null || p.hastaMin !== null;
  // Hay lugar esos días, pero no en la franja que pidió (FAQ del 3/10).
  if (conFranja && p.hayLugarFueraDeLaFranja) return { nota: NOTA_FRANJA };
  const reserva = await notaDeReservaUrgencia(ctx, p);
  if (reserva) return { nota: reserva };

  const porQue = await porQueNoHayLugar(ctx, p);
  const eligio = p.eligioUnHorario ? "El horario que eligió no está disponible. " : "";
  const alternativa = await buscarLoMasCercano(ctx, p);
  if (alternativa.ofrecidos) {
    return {
      alternativas: alternativa.ofrecidos,
      nota: `${eligio}${porQue} No pases la charla ni digas que no hay lugar en general: contáselo y ofrecé los ` +
        `horarios de alternativas, que son los más cercanos ${alternativa.antes ? "antes" : "después"} de lo que pidió ` +
        "(un día que no figura ahí no lo des por lleno: buscalo). Preguntale cuál le queda bien.",
    };
  }
  if (conFranja) return { nota: NOTA_FRANJA };
  const nombre = (ymd: string) => fechaLarga(alMediodia(ymd), ctx.tz);
  const tampoco = alternativa.mirado
    ? `Tampoco hay lugar en los días más cercanos (se miró del ${nombre(alternativa.mirado.desde)} al ${nombre(alternativa.mirado.hasta)}).`
    : "No queda otro día antes del evento.";
  return {
    nota: `${eligio}${porQue} ${tampoco} Derivá con dato_no_encontrado sin enviar una negativa de disponibilidad: ` +
      "el equipo le busca un lugar.",
  };
}

// Por qué en los días pedidos no hay lugar, para que Lucía lo diga bien: un posible feriado (0098)
// es feriado, sin decir que el local cierra; un día en cierres_agenda (o sin franjas, como el
// domingo) es que el local está cerrado; un día pegado al evento es que el traje no llega a estar
// listo (la agenda lo avisa con ultimoDiaAntesDelEvento); el resto, que ya está completo.
async function porQueNoHayLugar(ctx: ContextoHerramienta, p: PedidoSinLugar): Promise<string> {
  const nombre = (ymd: string) => fechaLarga(alMediodia(ymd), ctx.tz);
  const sinTurnos = await diasSinTurnos(ctx.db, p.desde, p.hasta);
  const motivos: string[] = [];
  let pegadoAlEvento: string | null = null;
  let hayPosibleFeriado = false;
  let completos = 0;
  for (let d = p.desde; d <= p.hasta; d = sumarDias(d, 1)) {
    const dia = sinTurnos.get(d);
    if (dia?.posibleFeriado) {
      hayPosibleFeriado = true;
      motivos.push(`el ${nombre(d)} es feriado (${dia.motivo.replace(/^Feriado: /, "")})`);
    } else if (dia) {
      motivos.push(`el ${nombre(d)} el local está cerrado${dia.motivo ? ` (${dia.motivo})` : ""}`);
    } else if (!p.franjas.some((f) => f.diaSemana === partesLocales(alMediodia(d), ctx.tz).diaSemana)) {
      // Un domingo se nombra solo si lo pidió a él: en un rango de días, decir que cierra es ruido.
      if (p.desde === p.hasta) motivos.push(`el ${nombre(d)} el local está cerrado`);
    } else if (p.ultimoDiaAntesDelEvento !== null && d > p.ultimoDiaAntesDelEvento) {
      pegadoAlEvento ??= d;
    } else {
      completos++;
    }
  }
  if (pegadoAlEvento) {
    const ultimo = nombre(p.ultimoDiaAntesDelEvento!);
    motivos.push(
      p.fechaEvento !== null && pegadoAlEvento >= p.fechaEvento
        ? `el ${nombre(pegadoAlEvento)} ya es el día del evento o después: la prueba tiene que ser hasta el ${ultimo}`
        : `${p.desde === p.hasta ? "el" : "desde el"} ${nombre(pegadoAlEvento)} ya queda muy cerca del evento: para que ` +
          `lleguen los ajustes, la prueba tiene que ser hasta el ${ultimo}`,
    );
  }
  // Un posible feriado no está decidido: el local puede abrir (0098, el contexto tampoco lo dice).
  const feriado = hayPosibleFeriado ? " Del feriado decí solo que es feriado, sin decir que el local cierra." : "";
  const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (p.desde === p.hasta) return `${mayuscula(motivos[0] ?? `el ${nombre(p.desde)} ya está completo`)}.${feriado}`;
  const rango = `Del ${nombre(p.desde)} al ${nombre(p.hasta)} no queda lugar`;
  if (!motivos.length) return `${rango}: esos días ya están completos.`;
  return `${rango}: ${motivos.join("; ")}${completos ? "; los demás días ya están completos" : ""}.${feriado}`;
}

// Lo más cercano a lo pedido: primero las dos semanas siguientes (nunca más allá del evento) y, si
// ahí tampoco hay lugar, las dos semanas de antes, sin pasar de hoy. Antes es para el día pegado al
// evento (el viernes de un casamiento el sábado ya no llega) o para una semana que está llena; Mateo
// pidió hacia adelante, y para atrás se mira solo si adelante no hay nada, en vez de pasar la charla.
// Cada rango que se mira queda en la traza, como cualquier búsqueda: derivar_a_persona lo cuenta
// para saber si se buscó lo suficiente antes de pasar la charla por falta de lugar.
async function buscarLoMasCercano(
  ctx: ContextoHerramienta,
  p: PedidoSinLugar,
): Promise<
  { ofrecidos: Ofrecido[]; antes: boolean; mirado?: undefined } | { ofrecidos: null; mirado: { desde: string; hasta: string } | null }
> {
  const rangos: { desde: string; hasta: string; antes: boolean }[] = [];
  const despues = sumarDias(p.hasta, 1);
  let hastaDespues = sumarDias(despues, RANGO_MAXIMO_DIAS);
  if (p.fechaEvento !== null && hastaDespues > p.fechaEvento) hastaDespues = p.fechaEvento;
  if (despues <= hastaDespues) rangos.push({ desde: despues, hasta: hastaDespues, antes: false });
  if (p.desde > p.hoy) {
    const desdeAntes = sumarDias(p.desde, -(RANGO_MAXIMO_DIAS + 1));
    rangos.push({ desde: desdeAntes < p.hoy ? p.hoy : desdeAntes, hasta: sumarDias(p.desde, -1), antes: true });
  }
  // De dónde a dónde se miró, lo pedido incluido: va en la nota cuando tampoco hay lugar.
  const mirado = { desde: p.desde, hasta: p.hasta };
  for (const r of rangos) {
    ctx.traza.rangosBuscados.push({ desde: r.desde, hasta: r.hasta });
    if (r.desde < mirado.desde) mirado.desde = r.desde;
    if (r.hasta > mirado.hasta) mirado.hasta = r.hasta;
    const agenda = await ctx.agenda.huecos({ desde: r.desde, hasta: r.hasta, tipo: p.tipo, ahora: ctx.ahora, fechaEvento: p.fechaEvento });
    const porInicio = enLaFranjaPedida(validosPorInicio(agenda.huecos, r.desde, r.hasta, p.franjas, ctx).porInicio, p.desdeMin, p.hastaMin, null, ctx.tz);
    if (porInicio.size === 0) continue;
    const resumen = resumirPorDia([...porInicio.keys()], ctx.tz);
    const dias = [...new Set(resumen.map((k) => fechaLocal(new Date(k), ctx.tz)))];
    const cercanos = new Set(r.antes ? dias.slice(-DIAS_ALTERNATIVOS) : dias.slice(0, DIAS_ALTERNATIVOS));
    const elegidos = resumen.filter((k) => cercanos.has(fechaLocal(new Date(k), ctx.tz)));
    return { ofrecidos: ofrecer(ctx, elegidos, porInicio, p.tipo), antes: r.antes };
  }
  return { ofrecidos: null, mirado: rangos.length ? mirado : null };
}

// Reserva de urgencia (0030; apagada desde el 10/10, 0098: dias_reserva_urgencia = null). Si
// vuelve a prenderse, lo pedido puede venir vacío porque esos días se guardan para eventos más
// cercanos, no porque esté lleno: eso se explica como antes, sin buscar alternativas.
async function notaDeReservaUrgencia(ctx: ContextoHerramienta, p: PedidoSinLugar): Promise<string | null> {
  // Caso real del 3/10 (Larisa): "turno para el lunes", sin fecha de evento; el lunes caía en la
  // reserva, vino vacío y Lucía derivó — el equipo le dio las 18 h del lunes. Lo que falta es un
  // dato del cliente, no una persona: se le pregunta la fecha del evento.
  const finReserva = await finDeReservaUrgencia(ctx.db, p.hoy);
  const urgente = p.fechaEvento !== null && finReserva !== null && p.fechaEvento <= finReserva;
  if (finReserva === null || p.desde >= finReserva || urgente) return null;
  const ultimoReservado = fechaLarga(alMediodia(sumarDias(finReserva, -1)), ctx.tz);
  const primeroLibre = fechaLarga(alMediodia(finReserva), ctx.tz);
  if (p.fechaEvento === null) {
    ctx.traza.reservaSinFechaEvento = true;
    return `Hasta el ${ultimoReservado} los turnos se guardan para eventos muy cercanos. No derives ni ` +
      "digas que no hay lugar: preguntale para cuándo es el evento. Si es hasta el " + primeroLibre + ", buscá " +
      "de nuevo con fecha_evento y esos días se abren; si es más adelante, buscá desde el " + finReserva +
      " y ofrecé esos días.";
  }
  // Caso real del 6/10 (graduación en diciembre): «para mañana no puedo reservar por la
  // anticipación del evento». Explicar la reserva confunde: su evento está lejos.
  return `Hasta el ${ultimoReservado} los turnos se guardan para eventos más cercanos que el suyo. ` +
    `No digas que no hay lugar en general ni le expliques el motivo (no es por su evento ni por la ` +
    `anticipación): decile simplemente que ese día ya está completo, buscá desde el ${finReserva} y ` +
    "ofrecé esos días.";
}

// Un instante de ese día para nombrarlo con fechaLarga: las 15 UTC caen el mismo día en
// cualquier huso de América.
function alMediodia(ymd: string): Date {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 15));
}

// Primer día que la agenda le ofrece a un evento lejano o sin fecha (hoy + dias_reserva_urgencia,
// misma cuenta que huecos.ts), o null si no hay reserva.
async function finDeReservaUrgencia(db: Db, hoy: string): Promise<string | null> {
  const [c] = await db.consulta<{ dias_reserva_urgencia: number | null }>("select dias_reserva_urgencia from configuracion_agenda limit 1");
  const n = c?.dias_reserva_urgencia;
  return n === null || n === undefined ? null : sumarDias(hoy, Number(n));
}
