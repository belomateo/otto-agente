// cancelar_turno(turno_id, motivo) — cancela un turno del cliente (AGENTE.md § 4). Toca el
// mundo. Precondiciones en código: el turno existe, es de este cliente y sigue activo. La fila
// no se borra: queda 'cancelado' con su motivo (y cancelado_at, que pone la base, paneles
// 0011); el hueco se libera y el evento sale de Calendar.

import { AUTOR_LUCIA, esEstadoActivo, ESTADO_TURNO_CANCELADO } from "../enums.ts";
import { leerFicha } from "./ficha.ts";
import { type Herramienta, objeto, rechazo } from "./tipos.ts";
import { alCalendario, leerTurno } from "./turnos.ts";

type Args = { turno_id: string; motivo: string };

export const cancelarTurno: Herramienta<Args> = {
  nombre: "cancelar_turno",
  tipo: "accion",
  descripcion: "Cancela un turno del cliente cuando te dice que no va a venir y no quiere otro horario (si quiere " +
    "otro horario, usá reprogramar_turno). Anotá el motivo con sus palabras. El turno queda cancelado, no se borra.",
  parametros: objeto({
    turno_id: { type: "string", format: "uuid", description: "El turno_id que figura en sus turnos." },
    motivo: { type: "string", minLength: 3, maxLength: 300, description: "Por qué cancela, con sus palabras." },
  }),
  async ejecutar(args, ctx) {
    const t = await leerTurno(ctx.db, args.turno_id.toLowerCase());
    if (!t) return rechazo("turno_inexistente", "Ese turno_id no existe. Usá el que figura en sus turnos del contexto.");
    if (t.clienteId !== ctx.cliente.id) {
      return rechazo("turno_de_otro_cliente", "Ese turno no es de este cliente: solo se cancelan los turnos de la persona con la que hablás.");
    }
    if (!esEstadoActivo(t.estado) || !(t.fin > ctx.ahora)) {
      return rechazo("turno_no_activo", `Ese turno ya no está activo (estado ${t.estado}): no hay nada que cancelar.`);
    }
    await ctx.db.consulta(
      "update turnos set estado = $2, motivo_cancelacion = $3, editado_por = $4 where id = $1::uuid",
      [t.id, ESTADO_TURNO_CANCELADO, args.motivo.trim(), AUTOR_LUCIA],
    );
    const ficha = await leerFicha(ctx.db, ctx.cliente.id);
    await alCalendario(ctx, "cancelar", {
      turnoId: t.id,
      inicio: t.inicio,
      fin: t.fin,
      tipo: t.tipo,
      probador: t.probador,
      nombre: ficha.nombre ?? "",
      telefono: ctx.cliente.telefono,
      googleEventId: t.googleEventId,
    });
    return {
      ok: true,
      datos: {
        turno_id: t.id,
        estado: ESTADO_TURNO_CANCELADO,
        nota: "El turno quedó cancelado. Si más adelante quiere venir, buscá horarios y agendá uno nuevo.",
      },
    };
  },
};
