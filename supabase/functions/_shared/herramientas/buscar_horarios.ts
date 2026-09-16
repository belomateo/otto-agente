// buscar_horarios(desde, hasta, tipo_turno, fecha_evento?) — huecos reales de la agenda
// (AGENTE.md § 4). Los huecos los calcula la agenda (logica, H1.13) por probador y duración,
// dentro de las franjas de turnos y por orden de urgencia (decisiones #7 y #9). Acá:
//  · con el evento hoy o mañana no se ofrece nada: se deriva en código con motivo
//    evento_inminente (decisión #8), lo diga la fecha o lo diga la agenda;
//  · se vuelve a descartar lo que quede en el pasado o fuera de una franja (o en un probador
//    que no toma turnos en esa franja);
//  · se agrupa por hora (el modelo no elige probador) y se eligen unos pocos por día, para
//    que Lucía ofrezca dos.
// Lo que se le muestra al modelo queda en la traza: es lo único que agendar_turno y
// reprogramar_turno aceptan en este turno.

import { TIPOS_TURNO, type TipoTurno } from "../enums.ts";
import { diasEntre, fechaLarga, fechaLocal, horaLocal, isoLocal, MINUTOS_POR_HORA, minutosDelDia } from "../tiempo.ts";
import { derivarPorEventoInminente, esEventoInminente } from "./derivacion.ts";
import { actualizarFicha, leerFicha } from "./ficha.ts";
import { dentroDeFranja, leerFranjas } from "./horario_laboral.ts";
import { type Herramienta, objeto, rechazo } from "./tipos.ts";

type Args = { desde: string; hasta: string; tipo_turno: TipoTurno; fecha_evento: string | null };

const RANGO_MAXIMO_DIAS = 13; // dos semanas por consulta
const MEDIODIA = 13 * MINUTOS_POR_HORA; // antes de la una se dice "a la mañana"
const POR_FRANJA = 2; // por día: dos opciones a la mañana y dos a la tarde
const MAXIMO_OPCIONES = 16;

export const buscarHorarios: Herramienta<Args> = {
  nombre: "buscar_horarios",
  tipo: "consulta",
  descripcion: "Devuelve huecos reales para un turno en el local entre dos fechas, ya filtrados por las franjas " +
    "de turnos y los probadores libres, con los eventos más cercanos primero. Obligatoria antes de ofrecer un día " +
    "u hora, y otra vez justo antes de agendar_turno o reprogramar_turno, en el mismo turno. De lo que devuelve " +
    "ofrecé dos, nunca más de tres. tipo_turno: graduado, novio o invitado según quién se viste; doble o triple si " +
    "vienen dos o tres personas juntas; prueba_final solo para la prueba del día anterior al evento. Mandá la fecha " +
    "del evento si la sabés. Si el evento es hoy o mañana, no devuelve huecos: la charla pasa sola a un asesor del " +
    "local y vos no escribís nada más. Pedí como mucho dos semanas por vez.",
  parametros: objeto({
    desde: { type: "string", format: "date", description: "Primer día a mirar, AAAA-MM-DD." },
    hasta: { type: "string", format: "date", description: "Último día a mirar, AAAA-MM-DD." },
    tipo_turno: { type: "string", enum: [...TIPOS_TURNO], description: "Tipo de turno." },
    fecha_evento: {
      type: ["string", "null"],
      format: "date",
      description: "Fecha del evento, AAAA-MM-DD, si la sabés (si ya está en su libreta, podés mandarla igual).",
    },
  }),
  async ejecutar(args, ctx) {
    const hoy = fechaLocal(ctx.ahora, ctx.tz);
    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    const fechaEvento = args.fecha_evento ?? ficha.fecha_evento;
    if (fechaEvento && fechaEvento < hoy) {
      return rechazo("fecha_evento_pasada", `La fecha del evento (${fechaEvento}) ya pasó. Confirmala con el cliente.`);
    }
    if (esEventoInminente(fechaEvento, ctx.ahora, ctx.tz)) {
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
    if (diasEntre(desde, args.hasta) > RANGO_MAXIMO_DIAS) {
      return rechazo("rango_muy_largo", `Pedí como mucho ${RANGO_MAXIMO_DIAS + 1} días por vez.`);
    }

    const agenda = await ctx.agenda.huecos({
      desde,
      hasta: args.hasta,
      tipo: args.tipo_turno,
      ahora: ctx.ahora,
      fechaEvento,
    });
    if (agenda.derivar === "evento_inminente") return await derivarPorEventoInminente(ctx);

    const { franjas } = await leerFranjas(ctx.db);
    const porInicio = new Map<number, { inicio: Date; fin: Date; probador: number }[]>();
    let descartados = 0;
    for (const h of agenda.huecos) {
      const inicio = new Date(h.inicio);
      const fin = new Date(h.fin);
      const valido = !Number.isNaN(inicio.getTime()) && inicio > ctx.ahora &&
        fechaLocal(inicio, ctx.tz) >= desde && fechaLocal(inicio, ctx.tz) <= args.hasta &&
        dentroDeFranja(inicio, fin, franjas, ctx.tz, h.probador).ok;
      if (!valido) {
        descartados++;
        continue;
      }
      const k = inicio.getTime();
      porInicio.set(k, [...(porInicio.get(k) ?? []), { inicio, fin, probador: h.probador }]);
    }

    const elegidos: number[] = [];
    const porFranja = new Map<string, number>();
    for (const k of [...porInicio.keys()].sort((a, b) => a - b)) {
      const d = new Date(k);
      const clave = `${fechaLocal(d, ctx.tz)}|${minutosDelDia(d, ctx.tz) < MEDIODIA ? "mañana" : "tarde"}`;
      if ((porFranja.get(clave) ?? 0) >= POR_FRANJA) continue;
      porFranja.set(clave, (porFranja.get(clave) ?? 0) + 1);
      elegidos.push(k);
      if (elegidos.length >= MAXIMO_OPCIONES) break;
    }

    for (const k of elegidos) {
      for (const h of porInicio.get(k) ?? []) {
        ctx.traza.huecosOfrecidos.push({
          inicio: h.inicio.toISOString(),
          fin: h.fin.toISOString(),
          probador: h.probador,
          tipo: args.tipo_turno,
        });
      }
    }
    const huecos = elegidos.map((k) => {
      const d = new Date(k);
      return {
        fecha_hora: isoLocal(d, ctx.tz),
        dia: fechaLarga(d, ctx.tz),
        hora: horaLocal(d, ctx.tz),
        franja: minutosDelDia(d, ctx.tz) < MEDIODIA ? "mañana" : "tarde",
      };
    });
    ctx.traza.horasDevueltas.push(...huecos.map((h) => h.hora));

    const datos: Record<string, unknown> = { tipo_turno: args.tipo_turno, huecos };
    if (huecos.length === 0) {
      datos.nota = "No hay huecos en esas fechas. Buscá más adelante; si el evento es antes y no hay nada, derivá con motivo turno_urgente_sin_hueco.";
    }
    if (avisos.length) datos.aviso = avisos.join(" ");
    if (descartados) datos.descartados_fuera_de_horario = descartados;
    // Supuesto #35 (decisión #17, hito 2.3): sin mail en la ficha, pedilo una sola vez, en el
    // mismo mensaje en que ofrecés estos horarios (antes de agendar: después la confirmación de
    // código le pisa el texto). Si huecos viene vacío no tiene sentido pedirlo todavía — no hay
    // nada que ofrecer en el mismo mensaje.
    if (huecos.length > 0 && !ficha.email) datos.pedir_mail = true;
    return { ok: true, datos };
  },
};
