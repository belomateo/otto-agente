// cambiar_turno(accion, turno_id, fecha_hora?, motivo?) — confirmar, mover o cancelar un turno que
// el cliente ya tiene (AGENTE.md § 4). Toca el mundo.
//
// Pedido de Mateo (9/10): menos herramientas, cada una con más información. Junta a confirmar_turno,
// reprogramar_turno y cancelar_turno, que se usaron 4 veces cada una en 30 días y hacían lo mismo
// sobre el mismo objeto (un turno existente). Cada acción sigue corriendo el código de antes, con
// las mismas precondiciones (turno de este cliente, activo, hueco salido de buscar_horarios y
// elegido por el cliente, etc.): esto solo elige cuál, y exige el dato que cada una necesita.
// agendar_turno queda aparte a propósito: crear un turno es lo más delicado de Lucía.

import { cancelarTurno } from "./cancelar_turno.ts";
import { confirmarTurno } from "./confirmar_turno.ts";
import { reprogramarTurno } from "./reprogramar_turno.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

type Args = { accion: "confirmar" | "mover" | "cancelar"; turno_id: string; fecha_hora: string | null; motivo: string | null };

export const cambiarTurno: Herramienta<Args> = {
  nombre: "cambiar_turno",
  tipo: "accion",
  descripcion: "Confirma, mueve o cancela un turno que el cliente YA tiene (el turno_id está en sus turnos, en el " +
    "contexto). accion=confirmar: cuando te dice que sí, que confirma, que ahí va a estar, o cualquier forma de " +
    "decir que sigue en pie, aunque no use la palabra 'confirmar' y aunque responda al recordatorio; no preguntes " +
    "de más. accion=mover: a otro horario que el cliente eligió; antes, en este mismo turno, llamá a " +
    "buscar_horarios con el tipo de ese turno y mandá en fecha_hora una de las que devolvió, tal cual; nunca " +
    "agendes uno nuevo encima del que ya tiene. accion=cancelar: cuando no va a venir y no quiere otro horario; " +
    "mandá en motivo por qué, con sus palabras, y ofrecele buscar otro día. La confirmación de un turno confirmado " +
    "o movido la manda el sistema en un mensaje aparte: no la repitas.",
  parametros: objeto({
    accion: { type: "string", enum: ["confirmar", "mover", "cancelar"], description: "Qué hacer con el turno." },
    turno_id: { type: "string", format: "uuid", description: "El turno_id que figura en sus turnos." },
    fecha_hora: {
      type: ["string", "null"],
      format: "date-time",
      description: "Solo para mover: una fecha_hora de las que devolvió buscar_horarios en este turno, sin cambiarla. Si no, null.",
    },
    motivo: { type: ["string", "null"], maxLength: 300, description: "Solo para cancelar: por qué cancela, con sus palabras. Si no, null." },
  }),
  async ejecutar(args, ctx) {
    if (args.accion === "confirmar") return await confirmarTurno.ejecutar({ turno_id: args.turno_id }, ctx);
    if (args.accion === "mover") {
      const fechaHora = limpio(args.fecha_hora);
      if (!fechaHora) {
        return rechazo("falta_fecha_hora", "Para mover el turno mandá en fecha_hora una de las que devolvió buscar_horarios en este turno.");
      }
      return await reprogramarTurno.ejecutar({ turno_id: args.turno_id, fecha_hora: fechaHora }, ctx);
    }
    const motivo = limpio(args.motivo);
    if (!motivo || motivo.length < 3) {
      return rechazo("falta_motivo", "Para cancelar mandá en motivo por qué no viene, con sus palabras.");
    }
    return await cancelarTurno.ejecutar({ turno_id: args.turno_id, motivo }, ctx);
  },
};
