// derivar_a_persona(motivo, mensaje_al_cliente?) — pasa la charla a una persona (AGENTE.md
// § 4 y § 10, PROCESOS.md § 4). Toca el mundo y corta el turno. Precondiciones en código: el
// motivo es del enum (schema = derivaciones_motivo_check) y la despedida no tiene preguntas
// (principio 7). Con reclamo o descuento la despedida no se manda: sigue una persona. Si la
// charla ya tenía una derivación pendiente, no se crea otra.
// Efecto: fila en derivaciones, la conversación queda 'derivada' (Lucía no contesta hasta que
// alguien la devuelva) y el turno avisa al equipo. El texto fijo de fuera de horario lo pone
// el turno (H1.7), no esta herramienta. Las derivaciones duras (evento hoy o mañana) no pasan
// por acá: las hace el código en derivacion.ts.

import { MOTIVOS_DERIVACION, MOTIVOS_SIN_MENSAJE, type MotivoDerivacion } from "../enums.ts";
import { registrarDerivacion } from "./derivacion.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

type Args = { motivo: MotivoDerivacion; mensaje_al_cliente: string | null };

export const derivarAPersona: Herramienta<Args> = {
  nombre: "derivar_a_persona",
  tipo: "accion",
  descripcion: "Pasa la charla a una persona del equipo y corta tu turno: después de esto no escribís nada más. " +
    "Antes, contestá todo lo que sí podés. motivo: por qué derivás. mensaje_al_cliente: una despedida corta y " +
    "sin ninguna pregunta; con reclamo o descuento, null. Nunca anuncies un pase sin llamar a esta herramienta.",
  parametros: objeto({
    motivo: { type: "string", enum: [...MOTIVOS_DERIVACION], description: "Por qué derivás." },
    mensaje_al_cliente: {
      type: ["string", "null"],
      maxLength: 300,
      description: "Tu despedida, sin preguntas. null si el motivo es reclamo o descuento.",
    },
  }),
  async ejecutar(args, ctx) {
    const mensaje = limpio(args.mensaje_al_cliente);
    if (mensaje && /[?¿]/.test(mensaje)) {
      return rechazo(
        "mensaje_con_pregunta",
        "La despedida no puede tener una pregunta: después de derivar nadie la va a leer. Sacala o dejá el mensaje en null.",
      );
    }
    const { id, yaEstaba } = await registrarDerivacion(ctx, args.motivo);
    const sinDespedida = MOTIVOS_SIN_MENSAJE.includes(args.motivo);
    const datos: Record<string, unknown> = {
      derivacion_id: id,
      nota: sinDespedida && mensaje
        ? `Con motivo ${args.motivo} la despedida no se manda: sigue una persona. No escribas nada más.`
        : "La charla quedó en manos del equipo. No escribas nada más.",
    };
    if (yaEstaba) datos.ya_estaba_derivada = true;
    return {
      ok: true,
      datos,
      efectos: {
        cortaTurno: true,
        mensajesAlCliente: !sinDespedida && mensaje ? [mensaje] : [],
        avisoEquipo: { motivo: args.motivo, derivacionId: id },
      },
    };
  },
};
