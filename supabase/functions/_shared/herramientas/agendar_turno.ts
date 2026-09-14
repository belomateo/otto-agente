// agendar_turno — agenda un turno en el local (AGENTE.md § 4). Toca el mundo: cada
// precondición se valida en código antes de escribir, y cada rechazo tiene su test
// (tests/herramientas/rechazos.test.ts). En este orden:
//  1. la fecha_hora es futura;
//  2. el cliente no tiene otro turno activo (para eso está reprogramar_turno);
//  3. hay nombre y fecha del evento (en los argumentos o ya en la ficha), y el evento no pasó;
//  4. el turno no cae después del evento;
//  5. el hueco salió de buscar_horarios EN ESTE TURNO, para el mismo tipo (traza);
//  6. queda dentro del horario laboral vigente (tabla horarios), aunque venga de la agenda;
//  7. dura lo que dice duraciones_turno para ese tipo.
// Efecto: fila en turnos en el primer probador libre de los ofrecidos para esa hora, ficha del
// cliente, evento en Calendar (si falla, el turno queda con aviso) y la confirmación armada en
// código, que sale en un mensaje aparte.

import { EVENTOS, type Evento, TIPOS_TURNO, type TipoTurno } from "../enums.ts";
import { fechaLarga, fechaLocal, horaLocal } from "../tiempo.ts";
import { armarConfirmacion } from "./confirmacion.ts";
import { actualizarFicha, leerFicha } from "./ficha.ts";
import { dentroDeHorario, leerHorarios } from "./horario_laboral.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";
import {
  alCalendario,
  duracionDelTipo,
  huecosDeLaTraza,
  insertarEnProbadorLibre,
  minutosEntre,
  turnoActivoDelCliente,
} from "./turnos.ts";

type Args = {
  fecha_hora: string;
  tipo: TipoTurno;
  nombre: string | null;
  evento: Evento | null;
  fecha_evento: string | null;
};

export const agendarTurno: Herramienta<Args> = {
  nombre: "agendar_turno",
  tipo: "accion",
  descripcion: "Agenda un turno en el local para este cliente. Antes, en este mismo turno, llamá a " +
    "buscar_horarios con el mismo tipo y usá una fecha_hora tal cual la devolvió. Necesita el nombre, la fecha " +
    "del evento y el tipo de turno; si ya están en su libreta, podés mandarlos igual. El turno es siempre de la " +
    "persona con la que hablás. La confirmación con día, hora, dirección, mapa y condiciones la manda el sistema " +
    "en un mensaje aparte: no la repitas.",
  parametros: objeto({
    fecha_hora: {
      type: "string",
      format: "date-time",
      description: "Una fecha_hora de las que devolvió buscar_horarios en este turno, sin cambiarla.",
    },
    tipo: { type: "string", enum: [...TIPOS_TURNO], description: "El mismo tipo que usaste en buscar_horarios." },
    nombre: { type: ["string", "null"], maxLength: 80, description: "Nombre del cliente." },
    evento: { type: ["string", "null"], enum: [...EVENTOS, null], description: "Para qué evento es." },
    fecha_evento: { type: ["string", "null"], format: "date", description: "Fecha del evento, AAAA-MM-DD." },
  }),
  async ejecutar(args, ctx) {
    const inicio = new Date(args.fecha_hora);
    if (!(inicio > ctx.ahora)) {
      return rechazo("hueco_en_el_pasado", "Esa fecha y hora ya pasó. Llamá a buscar_horarios y ofrecé un hueco que venga.");
    }

    const activo = await turnoActivoDelCliente(ctx.db, ctx.cliente.id, ctx.ahora);
    if (activo) {
      return rechazo(
        "turno_activo",
        `Ya tiene un turno el ${fechaLarga(activo.inicio, ctx.tz)} a las ${horaLocal(activo.inicio, ctx.tz)} ` +
          `(turno_id ${activo.id}). No se agenda otro encima: si quiere cambiarlo, usá reprogramar_turno.`,
      );
    }

    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    const nombre = limpio(args.nombre) ?? limpio(ficha.nombre);
    if (!nombre) {
      return rechazo("falta_nombre", "Falta el nombre del cliente. Pedíselo antes de agendar, en una sola pregunta, y guardalo.");
    }
    const fechaEvento = args.fecha_evento ?? ficha.fecha_evento;
    if (!fechaEvento) {
      return rechazo("falta_fecha_evento", "Falta la fecha del evento. Preguntásela antes de agendar y guardala.");
    }
    if (fechaEvento < fechaLocal(ctx.ahora, ctx.tz)) {
      return rechazo("fecha_evento_pasada", `La fecha del evento (${fechaEvento}) ya pasó. Confirmala con el cliente.`);
    }
    if (fechaLocal(inicio, ctx.tz) > fechaEvento) {
      return rechazo("turno_despues_del_evento", "Ese turno cae después del evento. Buscá un hueco antes de la fecha del evento.");
    }

    const candidatos = huecosDeLaTraza(ctx.traza, args.tipo, inicio);
    if (candidatos.length === 0) {
      return rechazo(
        "hueco_no_ofrecido",
        `Esa fecha_hora no salió de buscar_horarios en este turno para el tipo ${args.tipo}. ` +
          "Llamá a buscar_horarios ahora, con ese tipo, y usá una de las que devuelva, tal cual.",
      );
    }
    const fin = new Date(candidatos[0].fin);
    const horario = dentroDeHorario(inicio, fin, await leerHorarios(ctx.db), ctx.tz);
    if (!horario.ok) {
      return rechazo("fuera_de_horario", `Ese turno queda fuera del horario del local: ${horario.motivo}. Ofrecé otro de buscar_horarios.`);
    }
    const duracion = await duracionDelTipo(ctx.db, args.tipo);
    if (duracion !== null && duracion !== minutosEntre(inicio, fin)) {
      return rechazo("duracion_inconsistente", "La duración del hueco no coincide con la del tipo de turno. Volvé a llamar a buscar_horarios.");
    }

    const creado = await insertarEnProbadorLibre(ctx.db, {
      clienteId: ctx.cliente.id,
      tipo: args.tipo,
      inicio,
      fin,
      probadores: candidatos.map((c) => c.probador),
    });
    if (!creado) {
      return rechazo("hueco_ocupado", "Ese horario se acaba de ocupar. Llamá otra vez a buscar_horarios y ofrecé otro.");
    }

    await actualizarFicha(ctx.db, ctx.cliente.id, {
      nombre: limpio(args.nombre),
      evento: args.evento,
      fecha_evento: args.fecha_evento,
    });
    await alCalendario(ctx, "crear", {
      turnoId: creado.id,
      inicio,
      fin,
      tipo: args.tipo,
      probador: creado.probador,
      nombre,
      telefono: ctx.cliente.telefono,
      googleEventId: null,
    });
    const confirmacion = await armarConfirmacion(ctx.db, { nombre, inicio, tz: ctx.tz });
    ctx.traza.horasDevueltas.push(horaLocal(inicio, ctx.tz));

    const datos: Record<string, unknown> = {
      turno_id: creado.id,
      dia: fechaLarga(inicio, ctx.tz),
      hora: horaLocal(inicio, ctx.tz),
      tipo: args.tipo,
      nota: "Turno agendado. La confirmación con dirección, mapa y condiciones sale sola en un mensaje aparte: no la repitas.",
    };
    if (confirmacion.faltan.length) datos.faltan_en_la_confirmacion = confirmacion.faltan;
    return { ok: true, datos, efectos: { mensajesAlCliente: [confirmacion.texto] } };
  },
};
