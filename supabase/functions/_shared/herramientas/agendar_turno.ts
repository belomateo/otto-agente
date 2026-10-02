// agendar_turno — agenda un turno en el local (AGENTE.md § 4). Toca el mundo: cada
// precondición se valida en código antes de escribir, y cada rechazo tiene su test
// (tests/herramientas/rechazos.test.ts). En este orden:
//  1. la fecha_hora es futura;
//  2. la fecha del evento no pasó, y si es hoy o mañana no se agenda: se deriva en código con
//     motivo evento_inminente (decisión #8), aunque buscar_horarios haya dado huecos antes;
//  3. hay teléfono; nombre, correo y fecha del evento son opcionales;
//  4. el turno no cae después del evento;
//  5. el hueco salió de buscar_horarios EN ESTE TURNO, para el mismo tipo (traza);
//  6. entra en una franja de turnos vigente, en un probador que toma turnos en esa franja;
//  7. dura lo que dice duraciones_turno para ese tipo.
// Efecto: fila en turnos en el primer probador libre de los ofrecidos para esa hora, ficha del
// cliente, evento en Calendar (si falla, el turno queda con aviso) y la confirmación armada en
// código, que sale en un mensaje aparte.
//
// Decisión de Mateo, 16/9 (pedido 2): dos turnos para la misma persona se permiten. Antes esto
// rechazaba con turno_activo si el cliente ya tenía uno; ahora agenda igual y solo lo avisa en
// datos.aviso, para que Lucía lo pueda mencionar si hace falta (o para la bitácora), sin frenar
// la reserva. reprogramar_turno sigue intacto (opera sobre un turno_id puntual, no chequeaba esto).

import { EVENTOS, type Evento, TIPOS_TURNO, type TipoTurno } from "../enums.ts";
import { fechaLarga, fechaLocal, horaLocal } from "../tiempo.ts";
import { armarConfirmacion } from "./confirmacion.ts";
import { derivarPorEventoInminente, esEventoInminente } from "./derivacion.ts";
import { actualizarFicha, leerFicha } from "./ficha.ts";
import { dentroDeFranja, leerFranjas } from "./horario_laboral.ts";
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
  tipo: TipoTurno | null;
  nombre: string | null;
  evento: Evento | null;
  fecha_evento: string | null;
};

export const agendarTurno: Herramienta<Args> = {
  nombre: "agendar_turno",
  tipo: "accion",
  descripcion: "Agenda un turno en el local para este cliente. Antes, en este mismo turno, llamá a " +
    "buscar_horarios con el mismo tipo y fecha_hora elegida por el cliente. Reservá con teléfono de la charla " +
    "y fecha y hora elegidas, aunque falten nombre o correo, sin pedir otra confirmación. " +
    "tipo puede ser null: usa la duración de invitado sin atribuirle ese rol al cliente. El turno es siempre de la " +
    "persona con la que hablás. El sistema manda una lista con nombre, número, día y hora y Gmail, y pide los " +
    "datos opcionales que falten después de reservar. No repitas la lista ni la pregunta.",
  parametros: objeto({
    fecha_hora: {
      type: "string",
      format: "date-time",
      description: "Una fecha_hora de las que devolvió buscar_horarios en este turno, sin cambiarla.",
    },
    tipo: { type: ["string", "null"], enum: [...TIPOS_TURNO, null], description: "El mismo tipo que usaste en buscar_horarios; null si no se conoce." },
    nombre: { type: ["string", "null"], maxLength: 80, description: "Nombre del cliente." },
    evento: { type: ["string", "null"], enum: [...EVENTOS, null], description: "Para qué evento es." },
    fecha_evento: { type: ["string", "null"], format: "date", description: "Fecha del evento, AAAA-MM-DD." },
  }),
  async ejecutar(args, ctx) {
    const tipo = args.tipo ?? "invitado";
    const inicio = new Date(args.fecha_hora);
    if (!(inicio > ctx.ahora)) {
      return rechazo("hueco_en_el_pasado", "Esa fecha y hora ya pasó. Llamá a buscar_horarios y ofrecé un hueco que venga.");
    }

    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    const fechaEvento = args.fecha_evento ?? ficha.fecha_evento;
    if (fechaEvento && fechaEvento < fechaLocal(ctx.ahora, ctx.tz)) {
      return rechazo("fecha_evento_pasada", `La fecha del evento (${fechaEvento}) ya pasó. Confirmala con el cliente.`);
    }
    if (esEventoInminente(fechaEvento, ctx.ahora, ctx.tz)) {
      await actualizarFicha(ctx.db, ctx.cliente.id, {
        nombre: limpio(args.nombre),
        evento: args.evento,
        fecha_evento: args.fecha_evento,
      });
      return await derivarPorEventoInminente(ctx);
    }

    const activo = await turnoActivoDelCliente(ctx.db, ctx.cliente.id, ctx.ahora);

    const nombre = limpio(args.nombre) ?? limpio(ficha.nombre);
    if (!limpio(ctx.cliente.telefono)) {
      return rechazo("falta_telefono", "Falta el teléfono del cliente de esta conversación. No se pudo guardar el turno.");
    }
    if (fechaEvento && fechaLocal(inicio, ctx.tz) > fechaEvento) {
      return rechazo("turno_despues_del_evento", "Ese turno cae después del evento. Buscá un hueco antes de la fecha del evento.");
    }

    const candidatos = huecosDeLaTraza(ctx.traza, tipo, inicio);
    if (candidatos.length === 0) {
      return rechazo(
        "hueco_no_ofrecido",
        `Esa fecha_hora no salió de buscar_horarios en este turno para el tipo ${tipo}. ` +
          "Llamá a buscar_horarios ahora, con ese tipo, y usá una de las que devuelva, tal cual.",
      );
    }
    const fin = new Date(candidatos[0].fin);
    const enFranja = dentroDeFranja(inicio, fin, (await leerFranjas(ctx.db)).franjas, ctx.tz);
    if (!enFranja.ok) {
      return rechazo("fuera_de_horario", `Ese turno queda fuera de los horarios de turnos: ${enFranja.motivo}. Ofrecé otro de buscar_horarios.`);
    }
    const probadores = candidatos.map((c) => c.probador).filter((p) => p <= enFranja.franja.probadores);
    if (probadores.length === 0) {
      return rechazo(
        "fuera_de_horario",
        `A esa hora toman turnos ${enFranja.franja.probadores} probadores y ninguno de los ofrecidos es de ellos. Ofrecé otro de buscar_horarios.`,
      );
    }
    const duracion = await duracionDelTipo(ctx.db, tipo);
    if (duracion !== null && duracion !== minutosEntre(inicio, fin)) {
      return rechazo("duracion_inconsistente", "La duración del hueco no coincide con la del tipo de turno. Volvé a llamar a buscar_horarios.");
    }

    const creado = await insertarEnProbadorLibre(ctx.db, { clienteId: ctx.cliente.id, tipo, inicio, fin, probadores });
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
      tipo,
      probador: creado.probador,
      nombre: nombre ?? "",
      telefono: ctx.cliente.telefono,
      googleEventId: null,
    });
    const guardada = await leerFicha(ctx.db, ctx.cliente.id);
    const confirmacion = await armarConfirmacion(ctx.db, { nombre: guardada.nombre, telefono: ctx.cliente.telefono, email: guardada.email, inicio, tz: ctx.tz });
    ctx.traza.resumenTurnoEmitido = true;
    ctx.traza.horasDevueltas.push(horaLocal(inicio, ctx.tz));

    const datos: Record<string, unknown> = {
      turno_id: creado.id,
      dia: fechaLarga(inicio, ctx.tz),
      hora: horaLocal(inicio, ctx.tz),
      tipo,
      nota: "Turno agendado. El resumen y la pregunta por nombre/correo faltantes salen solos; no los repitas. Si después los da, usá guardar_datos_cliente, nunca crees otro turno.",
    };
    if (confirmacion.faltan.length) datos.faltan_en_la_confirmacion = confirmacion.faltan;
    if (activo) {
      datos.aviso = `El cliente ya tenía otro turno el ${fechaLarga(activo.inicio, ctx.tz)} a las ` +
        `${horaLocal(activo.inicio, ctx.tz)} (turno_id ${activo.id}); quedan los dos. No se lo menciones si no ` +
        "preguntó por el otro.";
    }
    return { ok: true, datos, efectos: { mensajesAlCliente: [confirmacion.texto], resumenTurnoId: creado.id } };
  },
};
