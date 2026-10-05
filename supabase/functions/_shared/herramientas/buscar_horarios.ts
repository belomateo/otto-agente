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

import type { Db } from "../db.ts";
import { TIPOS_TURNO, type TipoTurno } from "../enums.ts";
import { diasEntre, fechaLarga, fechaLocal, horaLocal, isoLocal, MINUTOS_POR_HORA, minutosDelDia, sumarDias } from "../tiempo.ts";
import { derivarPorEventoInminente, esEventoInminente } from "./derivacion.ts";
import { actualizarFicha, leerFicha } from "./ficha.ts";
import { dentroDeFranja, leerFranjas } from "./horario_laboral.ts";
import { type Herramienta, objeto, rechazo } from "./tipos.ts";

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
const POR_FRANJA = 2; // por día: dos opciones a la mañana y dos a la tarde
const MAXIMO_OPCIONES = 16;

// Dos personas por turno (Mateo, 2/10): en un turno normal pueden probarse dos. Antes esto decía
// "doble si vienen dos" y, con un cliente que quería sumar a alguien a su turno, Lucía buscó un
// doble de hora y media en ese horario, no lo encontró y derivó por dato_no_encontrado.
export const buscarHorarios: Herramienta<Args> = {
  nombre: "buscar_horarios",
  tipo: "consulta",
  descripcion: "Devuelve huecos reales para un turno en el local entre dos fechas, ya filtrados por las franjas " +
    "de turnos y los probadores libres, con los eventos más cercanos primero. Obligatoria antes de ofrecer un día " +
    "u hora, y otra vez justo antes de agendar_turno o reprogramar_turno, en el mismo turno. De lo que devuelve " +
    "ofrecé dos, nunca más de tres. tipo_turno: graduado, novio o invitado según quién se viste. Dos personas que " +
    "se prueban entran en un mismo turno: usá ese tipo, no doble; triple solo si son tres. Para sumar a alguien a un " +
    "turno que ya tiene no hace falta buscar: viene en ese mismo turno. prueba_final solo para la prueba del día " +
    "anterior al evento. Mandá la fecha " +
    "del evento si la sabés. Si el evento es hoy o mañana, no devuelve huecos: el sistema le pasa solo el teléfono " +
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
      description: "Fecha del evento, AAAA-MM-DD, si la sabés (si ya está en su libreta, podés mandarla igual).",
    },
  }),
  async ejecutar(args, ctx) {
    const tipo = args.tipo_turno ?? "invitado";
    const elegido = args.fecha_hora ? new Date(args.fecha_hora) : null;
    const hoy = fechaLocal(ctx.ahora, ctx.tz);
    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    const fechaEvento = args.fecha_evento ?? ficha.fecha_evento;
    if (fechaEvento) ctx.traza.reservaSinFechaEvento = false; // ya la sabe: el freno de abajo no aplica
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
    // Más de dos semanas: se recorta y se avisa, en vez de rechazar. El modelo pedía "dos semanas"
    // contando 15 días y perdía una vuelta entera (4 rechazos en las últimas 30 charlas; a un
    // cliente le preguntó "qué día te queda cómodo" en vez de ofrecerle horarios).
    let hasta = args.hasta;
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
        fechaLocal(inicio, ctx.tz) >= desde && fechaLocal(inicio, ctx.tz) <= hasta &&
        dentroDeFranja(inicio, fin, franjas, ctx.tz, h.probador).ok;
      if (!valido) {
        descartados++;
        continue;
      }
      // La franja pedida no filtra el horario exacto que eligió el cliente: ese se comprueba igual.
      const minutos = minutosDelDia(inicio, ctx.tz);
      const fueraDeFranja = (desdeMin !== null && minutos < desdeMin) || (hastaMin !== null && minutos >= hastaMin);
      if (fueraDeFranja && !(elegido && inicio.getTime() === elegido.getTime())) continue;
      const k = inicio.getTime();
      porInicio.set(k, [...(porInicio.get(k) ?? []), { inicio, fin, probador: h.probador }]);
    }

    const elegidos: number[] = [];
    // La elección del cliente no puede desaparecer al resumir las primeras opciones del día.
    if (elegido && porInicio.has(elegido.getTime())) elegidos.push(elegido.getTime());
    const porFranja = new Map<string, number>();
    for (const k of [...porInicio.keys()].sort((a, b) => a - b)) {
      if (elegido && elegidos[0] === elegido.getTime()) break;
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
          tipo,
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

    const datos: Record<string, unknown> = { tipo_turno: tipo, huecos };
    if (elegido) {
      datos.horario_elegido_disponible = porInicio.has(elegido.getTime());
      datos.nota = datos.horario_elegido_disponible
        ? "El horario elegido está libre. Agendá ahora con el teléfono de la charla, aunque falten nombre o correo; no pidas datos adicionales ni otra confirmación."
        : "No se pudo confirmar el horario elegido. Derivá con dato_no_encontrado antes de negar disponibilidad; no reserves otra hora por tu cuenta.";
    }
    if (huecos.length === 0) {
      datos.nota = "La búsqueda no devolvió huecos para esas fechas. Derivá con dato_no_encontrado sin enviar una negativa de disponibilidad ni cambiar la elección del cliente.";
      if (desdeMin !== null || hastaMin !== null) {
        datos.nota = "En esa franja no quedó lugar esos días. No derives ni digas que no hay lugar: buscá de nuevo " +
          "sin desde_hora ni hasta_hora y ofrecé los horarios más cercanos a lo que pidió.";
      }
      // Vacío por la reserva de urgencia (huecos.ts), no porque esté lleno. Caso real del 3/10
      // (Larisa): "turno para el lunes", sin fecha de evento; el lunes caía en la reserva, vino
      // vacío y Lucía derivó — el equipo le dio las 18 h del lunes. Lo que falta es un dato del
      // cliente, no una persona: se le pregunta la fecha del evento.
      const finReserva = await finDeReservaUrgencia(ctx.db, hoy);
      const urgente = fechaEvento !== null && finReserva !== null && fechaEvento <= finReserva;
      if (finReserva !== null && desde < finReserva && !urgente) {
        const ultimoReservado = fechaLarga(alMediodia(sumarDias(finReserva, -1)), ctx.tz);
        const primeroLibre = fechaLarga(alMediodia(finReserva), ctx.tz);
        if (fechaEvento === null) {
          ctx.traza.reservaSinFechaEvento = true;
          datos.nota = `Hasta el ${ultimoReservado} los turnos se guardan para eventos muy cercanos. No derives ni ` +
            "digas que no hay lugar: preguntale para cuándo es el evento. Si es hasta el " + primeroLibre + ", buscá " +
            "de nuevo con fecha_evento y esos días se abren; si es más adelante, buscá desde el " + finReserva +
            " y ofrecé esos días.";
        } else {
          datos.nota = `Hasta el ${ultimoReservado} los turnos se guardan para eventos más cercanos que el suyo. ` +
            `No digas que no hay lugar: buscá desde el ${finReserva} y ofrecé esos días.`;
        }
      }
    }
    if (avisos.length) datos.aviso = avisos.join(" ");
    if (descartados) datos.descartados_fuera_de_horario = descartados;
    // Nombre/correo se piden en el resumen posterior a reservar, nunca al buscar.
    return { ok: true, datos };
  },
};

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
