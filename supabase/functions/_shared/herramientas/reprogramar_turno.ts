// reprogramar_turno(turno_id, fecha_hora) — mueve un turno del cliente (AGENTE.md § 4).
// Toca el mundo. Precondiciones en código: el turno existe, es de este cliente y sigue activo;
// el hueco nuevo es futuro, salió de buscar_horarios en este turno para el tipo del turno,
// está dentro del horario vigente, dura lo que corresponde y no cae después del evento.
// Actualiza la misma fila (nunca crea otra encima), vuelve a "sin confirmar", mueve el evento
// de Calendar y manda la confirmación nueva armada en código.

import { esEstadoActivo } from "../enums.ts";
import { fechaLarga, fechaLocal, horaLocal } from "../tiempo.ts";
import { armarConfirmacion } from "./confirmacion.ts";
import { leerFicha } from "./ficha.ts";
import { dentroDeHorario, leerHorarios } from "./horario_laboral.ts";
import { type Herramienta, objeto, rechazo } from "./tipos.ts";
import { alCalendario, duracionDelTipo, huecosDeLaTraza, leerTurno, minutosEntre, moverAProbadorLibre } from "./turnos.ts";

type Args = { turno_id: string; fecha_hora: string };

export const reprogramarTurno: Herramienta<Args> = {
  nombre: "reprogramar_turno",
  tipo: "accion",
  descripcion: "Mueve a otro horario un turno que ya tiene el cliente. Antes, en este mismo turno, llamá a " +
    "buscar_horarios con el tipo de ese turno y usá una fecha_hora tal cual la devolvió. Nunca agendes uno " +
    "nuevo encima del que ya tiene. La confirmación nueva la manda el sistema en un mensaje aparte: no la repitas.",
  parametros: objeto({
    turno_id: { type: "string", format: "uuid", description: "El turno_id que figura en sus turnos." },
    fecha_hora: {
      type: "string",
      format: "date-time",
      description: "Una fecha_hora de las que devolvió buscar_horarios en este turno, sin cambiarla.",
    },
  }),
  async ejecutar(args, ctx) {
    const t = await leerTurno(ctx.db, args.turno_id.toLowerCase());
    if (!t) return rechazo("turno_inexistente", "Ese turno_id no existe. Usá el que figura en sus turnos del contexto.");
    if (t.clienteId !== ctx.cliente.id) {
      return rechazo("turno_de_otro_cliente", "Ese turno no es de este cliente: solo se mueven los turnos de la persona con la que hablás.");
    }
    if (!esEstadoActivo(t.estado) || !(t.fin > ctx.ahora)) {
      return rechazo(
        "turno_no_activo",
        `Ese turno ya no está activo (estado ${t.estado}) y no se mueve. Si quiere venir, buscá horarios y agendá uno nuevo.`,
      );
    }

    const inicio = new Date(args.fecha_hora);
    if (!(inicio > ctx.ahora)) {
      return rechazo("hueco_en_el_pasado", "Esa fecha y hora ya pasó. Llamá a buscar_horarios y ofrecé un hueco que venga.");
    }
    const candidatos = huecosDeLaTraza(ctx.traza, t.tipo, inicio);
    if (candidatos.length === 0) {
      return rechazo(
        "hueco_no_ofrecido",
        `Esa fecha_hora no salió de buscar_horarios en este turno para el tipo ${t.tipo}. ` +
          "Llamá a buscar_horarios ahora, con ese tipo, y usá una de las que devuelva, tal cual.",
      );
    }
    const fin = new Date(candidatos[0].fin);
    const horario = dentroDeHorario(inicio, fin, await leerHorarios(ctx.db), ctx.tz);
    if (!horario.ok) {
      return rechazo("fuera_de_horario", `Ese horario queda fuera del horario del local: ${horario.motivo}. Ofrecé otro de buscar_horarios.`);
    }
    const duracion = await duracionDelTipo(ctx.db, t.tipo);
    if (duracion !== null && duracion !== minutosEntre(inicio, fin)) {
      return rechazo("duracion_inconsistente", "La duración del hueco no coincide con la del tipo de turno. Volvé a llamar a buscar_horarios.");
    }
    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    if (ficha.fecha_evento && fechaLocal(inicio, ctx.tz) > ficha.fecha_evento) {
      return rechazo("turno_despues_del_evento", "Ese horario cae después del evento. Buscá un hueco antes de la fecha del evento.");
    }

    const movido = await moverAProbadorLibre(ctx.db, {
      turnoId: t.id,
      inicio,
      fin,
      probadores: candidatos.map((c) => c.probador),
    });
    if (!movido) {
      return rechazo("hueco_ocupado", "Ese horario se acaba de ocupar. Llamá otra vez a buscar_horarios y ofrecé otro.");
    }
    await alCalendario(ctx, "mover", {
      turnoId: t.id,
      inicio,
      fin,
      tipo: t.tipo,
      probador: movido.probador,
      nombre: ficha.nombre ?? "",
      telefono: ctx.cliente.telefono,
      googleEventId: t.googleEventId,
    });
    const confirmacion = await armarConfirmacion(ctx.db, { nombre: ficha.nombre, inicio, tz: ctx.tz });
    ctx.traza.horasDevueltas.push(horaLocal(inicio, ctx.tz));

    const datos: Record<string, unknown> = {
      turno_id: t.id,
      dia: fechaLarga(inicio, ctx.tz),
      hora: horaLocal(inicio, ctx.tz),
      nota: "Turno movido. La confirmación nueva sale sola en un mensaje aparte: no la repitas.",
    };
    if (confirmacion.faltan.length) datos.faltan_en_la_confirmacion = confirmacion.faltan;
    return { ok: true, datos, efectos: { mensajesAlCliente: [confirmacion.texto] } };
  },
};
