// derivar_a_persona(motivo, mensaje_al_cliente?) — pasa la charla a una persona (AGENTE.md
// § 4 y § 10, PROCESOS.md § 4). Toca el mundo y corta el turno. Precondiciones en código: el
// motivo es del enum QUE PUEDE ELEGIR EL MODELO (MOTIVOS_DERIVACION_LLM — no el enum completo
// de la base) y la despedida no tiene preguntas (principio 7). Si la charla ya tenía una
// derivación pendiente, no se crea otra.
//
// Pedido de Mateo, 19/9: toda derivación le tiene que dejar algo al cliente. Antes, con
// reclamo/cliente_enojado/descuento (MOTIVOS_SIN_MENSAJE) la despedida del modelo se tiraba y el
// cliente se quedaba mudo — y aunque el motivo no estuviera en esa lista, si el modelo mandaba
// mensaje_al_cliente: null (el propio rechazo de acá abajo por pregunta lo empujaba a eso: "sacala
// o dejá el mensaje en null"), también quedaba mudo. Ahora el silencio nunca es el resultado: con
// esos tres motivos, un texto fijo aprobado (texto_derivacion_reclamo) reemplaza la despedida del
// modelo — no se discute con alguien caliente, pero tampoco se lo deja sin nada — y si el motivo
// permite despedida propia pero no llegó ninguna, el genérico de siempre (texto_derivacion_dura_
// generica) hace de red de contención.
//
// Hallazgo C2 del tester (15/9): antes el schema aceptaba CUALQUIER motivo, incluido
// evento_inminente — el modelo podía derivar directo con ese motivo, tomando un atajo que se
// saltea buscar_horarios/agendar_turno (que son los que guardan la fecha del evento en código)
// y el texto fijo aprobado (contexto_agente.texto_evento_inminente): en 2 de 3 corridas del
// tester, la fecha se perdía y salía un texto improvisado. evento_inminente, barandilla_doble,
// sin_respuesta y timeout (MOTIVOS_SOLO_CODIGO) son derivaciones duras: "las decide código,
// nunca el LLM" (AGENTE.md § 2 y § 10) — por eso no están en el enum que ve esta herramienta.
// Si el modelo igual intenta uno (no debería pasar con salida estricta, pero el rechazo de acá
// es la última guarda), se lo rechaza con el motivo real.
//
// Hallazgo propio, 15/9, al volver a correr los 15 guiones después del fix de C2: cerrada la
// puerta de evento_inminente, en el guion evento-manana-deriva el modelo tomó la OTRA puerta que
// seguía abierta — llamó a esto con motivo turno_urgente_sin_hueco (sí es un motivo del LLM,
// para cuando de verdad no hay hueco antes del evento) sin haber llamado a buscar_horarios en el
// turno, así que nunca pasó por el chequeo de esEventoInminente de esa herramienta: la fecha no
// se guardó y salió un texto propio en vez del fijo. Mismo problema de fondo que C2 (un motivo
// de derivación que no obliga a pasar por el código que lo respalda), un escalón más abajo:
// turno_urgente_sin_hueco solo tiene sentido DESPUÉS de preguntarle de verdad a la agenda.
//
// Efecto: fila en derivaciones, la conversación queda 'derivada' (Lucía no contesta hasta que
// alguien la devuelva) y el turno avisa al equipo. El texto fijo de fuera de horario lo pone
// el turno (H1.7), no esta herramienta. Las derivaciones duras no pasan por acá: las hace el
// código en derivacion.ts (evento_inminente) o turno.ts (barandilla_doble, sin_respuesta,
// timeout).

import { MOTIVOS_DERIVACION_LLM, MOTIVOS_SIN_MENSAJE, MOTIVOS_SOLO_CODIGO, type MotivoDerivacion } from "../enums.ts";
import { llamoA } from "../traza.ts";
import { registrarDerivacion, textoDeContexto } from "./derivacion.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

const CLAVE_TEXTO_DERIVACION_RECLAMO = "texto_derivacion_reclamo";
const CLAVE_TEXTO_DERIVACION_DURA_GENERICA = "texto_derivacion_dura_generica";

type Args = { motivo: MotivoDerivacion; mensaje_al_cliente: string | null };

export const derivarAPersona: Herramienta<Args> = {
  nombre: "derivar_a_persona",
  tipo: "accion",
  descripcion: "Pasa la charla a una persona del equipo y corta tu turno: después de esto no escribís nada más. " +
    "Antes, contestá todo lo que sí podés. motivo: por qué derivás. mensaje_al_cliente: SIEMPRE escribí una " +
    "despedida corta y sin ninguna pregunta, nunca null — con reclamo o descuento el sistema la reemplaza por un " +
    "texto fijo, así que no te esfuerces con esas dos, pero escribí algo igual. Nunca anuncies un pase sin llamar " +
    "a esta herramienta. Si el evento del cliente es hoy o mañana, NO uses esta herramienta: llamá a " +
    "buscar_horarios (con la fecha del evento) y el código se encarga de derivar solo, con el dato guardado y el " +
    "texto correcto. Con motivo turno_urgente_sin_hueco: llamá primero a buscar_horarios en este mismo turno (con " +
    "la fecha del evento) y confirmá que de verdad no hay hueco antes de derivar por esto.",
  parametros: objeto({
    motivo: { type: "string", enum: [...MOTIVOS_DERIVACION_LLM], description: "Por qué derivás." },
    mensaje_al_cliente: {
      type: ["string", "null"],
      maxLength: 300,
      description: "Tu despedida, sin preguntas. Escribila siempre, aunque el motivo sea reclamo o descuento " +
        "(el sistema la reemplaza igual).",
    },
  }),
  async ejecutar(args, ctx) {
    if ((MOTIVOS_SOLO_CODIGO as readonly string[]).includes(args.motivo)) {
      return rechazo(
        "motivo_solo_codigo",
        `El motivo ${args.motivo} lo decide el código, no vos. Si es porque el evento es hoy o mañana, llamá a ` +
          "buscar_horarios con la fecha del evento: el código deriva solo, con el dato guardado y el texto correcto.",
      );
    }
    if (args.motivo === "turno_urgente_sin_hueco" && !llamoA(ctx.traza, "buscar_horarios")) {
      return rechazo(
        "sin_buscar_horarios",
        "Para derivar por falta de hueco, primero llamá a buscar_horarios en este mismo turno con la fecha del " +
          "evento: si el evento termina siendo hoy o mañana, el código deriva solo con el dato guardado y el " +
          "texto correcto; si no, confirmás de verdad que no hay hueco antes de derivar por esto.",
      );
    }
    const mensaje = limpio(args.mensaje_al_cliente);
    if (mensaje && /[?¿]/.test(mensaje)) {
      return rechazo(
        "mensaje_con_pregunta",
        "La despedida no puede tener una pregunta: después de derivar nadie la va a leer. Sacala.",
      );
    }
    const { id, yaEstaba } = await registrarDerivacion(ctx, args.motivo);
    const sinDespedida = MOTIVOS_SIN_MENSAJE.includes(args.motivo);
    // Pedido de Mateo, 19/9: nunca mudo. Con reclamo/cliente_enojado/descuento, el texto fijo de
    // "no se discute" reemplaza lo que haya escrito el modelo (si escribió algo). Si el motivo
    // permite despedida propia pero no llegó ninguna (o quedó en blanco), el genérico de siempre
    // hace de red de contención — antes eso quedaba en [] sin más.
    const textoAlCliente = sinDespedida
      ? await textoDeContexto(ctx.db, CLAVE_TEXTO_DERIVACION_RECLAMO)
      : mensaje ?? await textoDeContexto(ctx.db, CLAVE_TEXTO_DERIVACION_DURA_GENERICA);
    const datos: Record<string, unknown> = {
      derivacion_id: id,
      nota: sinDespedida
        ? `Con motivo ${args.motivo} tu despedida no se manda: la reemplaza un texto fijo, sigue una persona. No escribas nada más.`
        : "La charla quedó en manos del equipo. No escribas nada más.",
    };
    if (yaEstaba) datos.ya_estaba_derivada = true;
    return {
      ok: true,
      datos,
      efectos: {
        cortaTurno: true,
        mensajesAlCliente: textoAlCliente ? [textoAlCliente] : [],
        avisoEquipo: { motivo: args.motivo, derivacionId: id },
      },
    };
  },
};
