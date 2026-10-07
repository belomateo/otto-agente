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
import { hastaMasLejanoBuscado, llamoA } from "../traza.ts";
import { diasEntre, fechaLocal, sumarDias } from "../tiempo.ts";
import {
  type ClaveDerivacion,
  CLAVE_TEXTO_DERIVACION_DURA_GENERICA,
  CLAVE_TEXTO_DERIVACION_RECLAMO,
  CLAVE_TEXTO_DEVOLUCION_TARDIA,
  registrarDerivacion,
  textoDeDerivacion,
} from "./derivacion.ts";
import { normalizar } from "../barandillas/texto.ts";
import { leerFicha } from "./ficha.ts";
import { type ContextoHerramienta, type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

// Mismo techo que buscar_horarios.ts (RANGO_MAXIMO_DIAS): no le podemos pedir que busque más
// lejos que lo que la herramienta acepta en una sola llamada.
const RANGO_MAXIMO_DIAS = 13;

// Motivos con un texto fijo propio, que reemplaza la despedida del modelo (5/10): el de
// devolucion_tardia le pasa al cliente el teléfono del local, que Lucía nunca escribe.
const TEXTO_FIJO_DEL_MOTIVO: Partial<Record<MotivoDerivacion, ClaveDerivacion>> = {
  devolucion_tardia: CLAVE_TEXTO_DEVOLUCION_TARDIA,
};

// Palabras de una consulta por modelos (5/10). Sin "traje" ni "ambo" a secas: "¿cuánto sale un
// traje de nene?" es otra consulta. Y si nombra un accesorio, es de accesorios, no del catálogo.
const PALABRAS_DE_MODELO = new RegExp(
  "\\b(?:modelos?|colou?r(?:es)?|fotos?|catalogos?|estilos?|smoking|esmoquin|jacket|" +
    "negros?|azul(?:es|ino)?|gris(?:es)?|verdes?|bordo|beige|marron(?:es)?|celestes?|blancos?|crema|arena|" +
    "rojos?|mostaza|rayad[oa]s?|cuadros?|chocolate|cruzad[oa]|slim|clasic[oa]|entallad[oa])\\b",
);
const PALABRAS_DE_ACCESORIO = /\b(?:zapat\w*|camisa\w*|corbata\w*|cintur\w*|cinto\w*|mono|monos)\b/;

const DESPEDIDA = /^(?:(?:(?:muchas?|mil)\s+)?gracias?\b|ok(?:ay)?\b|bueno\b|dale\b|perfect[oa]?\b|buenisim[oa]?\b|list[oa]?\b|genial\b|bien\b|(?:de\s+)?acuerdo\b|clar[oa]?\b|(?:muy\s+)?amable\b|okok\b|eso\s+era\b|nada\s+mas\b|ya\s+(?:esta|fue)\b)/;

function mandoElCatalogo(ctx: ContextoHerramienta): boolean {
  return ctx.traza.llamadas.some((l) => l.ok && l.herramienta === "enviar_link" && (l.argumentos as { tipo?: string } | null)?.tipo === "web");
}

// Lo que escribió el cliente en esta ráfaga (todo lo entrante desde la última respuesta).
async function preguntaPorModelos(ctx: ContextoHerramienta): Promise<boolean> {
  const filas = await ctx.db.consulta<{ texto: string | null }>(
    `select string_agg(concat_ws(' ', contenido, transcripcion), ' ' order by enviado_at) as texto from mensajes
      where conversacion_id = $1::uuid and direccion = 'entrante'
        and enviado_at > coalesce((select max(enviado_at) from mensajes where conversacion_id = $1::uuid and direccion = 'saliente'), '-infinity'::timestamptz)`,
    [ctx.conversacionId],
  );
  const texto = normalizar(filas[0]?.texto ?? "");
  return PALABRAS_DE_MODELO.test(texto) && !PALABRAS_DE_ACCESORIO.test(texto);
}

async function esDespedida(ctx: ContextoHerramienta): Promise<boolean> {
  const filas = await ctx.db.consulta<{ texto: string | null }>(
    `select string_agg(concat_ws(' ', contenido, transcripcion), ' ' order by enviado_at) as texto from mensajes
      where conversacion_id = $1::uuid and direccion = 'entrante'
        and enviado_at > coalesce((select max(enviado_at) from mensajes where conversacion_id = $1::uuid and direccion = 'saliente'), '-infinity'::timestamptz)`,
    [ctx.conversacionId],
  );
  const texto = normalizar(filas[0]?.texto ?? "").trim();
  if (!texto || texto.length > 80 || /[?¿]/.test(texto)) return false;
  return DESPEDIDA.test(texto);
}

function despedidaMencionaModelo(mensaje: string | null): boolean {
  if (!mensaje) return false;
  const n = normalizar(mensaje);
  return PALABRAS_DE_MODELO.test(n) && !PALABRAS_DE_ACCESORIO.test(n);
}

type Args = { motivo: MotivoDerivacion; mensaje_al_cliente: string | null };

export const derivarAPersona: Herramienta<Args> = {
  nombre: "derivar_a_persona",
  tipo: "accion",
  descripcion: "Pasa la charla a una persona del equipo y corta tu turno: después de esto no escribís nada más. " +
    "Antes, contestá todo lo que sí podés. Si el cliente se despide o agradece, no derives: cerrá la charla. " +
    "motivo: por qué derivás. mensaje_al_cliente: SIEMPRE escribí una " +
    "despedida corta y sin ninguna pregunta, nunca null — con reclamo o descuento el sistema la reemplaza por un " +
    "texto fijo, así que no te esfuerces con esas dos, pero escribí algo igual. Nunca anuncies un pase sin llamar " +
    "a esta herramienta. Si el evento del cliente es hoy o mañana, NO uses esta herramienta: llamá a " +
    "buscar_horarios (con la fecha del evento) y el código se encarga solo: guarda el dato y le pasa el teléfono " +
    "del local. Por un modelo, color o estilo no derives: mandá el catálogo online (enviar_link, tipo web). " +
    "devolucion_tardia: quiere devolver el traje después del día hábil siguiente al evento (de un evento de fin de " +
    "semana, después del lunes); nunca le digas que no hay problema: el sistema le pasa el teléfono del local para " +
    "confirmarlo. Con motivo turno_urgente_sin_hueco: llamá primero a buscar_horarios en este mismo turno (con " +
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
    // No alcanza con haber llamado a buscar_horarios: tiene que haber mirado un rango que de
    // verdad llegue cerca de la fecha del evento. Hallazgo en vivo, 1/10: el modelo buscó
    // desde=hasta=hoy (un solo día) con el evento a 9 días, no encontró nada ESE día y derivó
    // igual — en un caso con motivo turno_urgente_sin_hueco (Cristianlaky) y en otro idéntico
    // con motivo dato_no_encontrado (Fabricio, mismo día): el motivo que el modelo elige no
    // cambia el problema de fondo, así que el chequeo corre para cualquier motivo, no solo
    // turno_urgente_sin_hueco — si llamó a buscar_horarios, no encontró ningún hueco en TODO el
    // turno y el rango que miró no llega ni cerca del evento, no hay forma de que "no hay hueco"
    // sea cierto todavía.
    if (llamoA(ctx.traza, "buscar_horarios") && ctx.traza.huecosOfrecidos.length === 0) {
      const hoy = fechaLocal(ctx.ahora, ctx.tz);
      const ficha = await leerFicha(ctx.db, ctx.cliente.id);
      if (ficha.fecha_evento && ficha.fecha_evento > hoy) {
        const limite = diasEntre(hoy, ficha.fecha_evento) > RANGO_MAXIMO_DIAS
          ? sumarDias(hoy, RANGO_MAXIMO_DIAS)
          : ficha.fecha_evento;
        const masLejano = hastaMasLejanoBuscado(ctx.traza);
        if (!masLejano || masLejano < limite) {
          return rechazo(
            "busqueda_muy_corta",
            `Buscaste hasta ${masLejano ?? hoy}, pero el evento es el ${ficha.fecha_evento}: volvé a llamar a ` +
              `buscar_horarios con hasta "${limite}" (desde hoy) antes de derivar por esto — recién con eso ` +
              "confirmás que de verdad no hay hueco antes del evento.",
          );
        }
      }
    }
    // Vacío por la reserva de urgencia y sin fecha de evento (caso Larisa, 3/10): no falta una
    // persona, falta preguntarle la fecha. Solo frena los motivos de "no encontré lugar/dato".
    if (
      ctx.traza.reservaSinFechaEvento && ctx.traza.huecosOfrecidos.length === 0 &&
      (args.motivo === "dato_no_encontrado" || args.motivo === "turno_urgente_sin_hueco")
    ) {
      return rechazo(
        "falta_fecha_evento",
        "Los días que buscaste se guardan para eventos muy cercanos y todavía no sabés la fecha del evento: " +
          "no derives, preguntale para cuándo es el evento y volvé a buscar con fecha_evento.",
      );
    }
    if (args.motivo === "dato_no_encontrado" && await esDespedida(ctx)) {
      return rechazo(
        "despedida_no_es_derivacion",
        "El cliente se está despidiendo o agradeciendo, no falta un dato. No derives: cerrá la charla " +
          "con algo como «De nada, cualquier cosa me escribís por acá» y listo.",
      );
    }
    // Pedido de Mateo, 5/10: por un modelo, un color, un estilo o una foto no se deriva. Lucía ya
    // no asesora sobre modelos: manda el catálogo online y aclara que la disponibilidad depende del
    // talle y de la fecha. Antes "¿tienen en verde oscuro?" o "estilo Peaky Blinders" terminaban en
    // dato_no_encontrado, Lucía quedaba apagada y el cliente esperaba horas una respuesta.
    // 7/10: también mira la despedida del modelo ("confirmar opciones en verde") y funciona aunque
    // el catálogo ya se haya mandado — antes la guardia pasaba si mandoElCatalogo era true.
    if (args.motivo === "dato_no_encontrado" && (await preguntaPorModelos(ctx) || despedidaMencionaModelo(args.mensaje_al_cliente))) {
      const yaMando = mandoElCatalogo(ctx);
      return rechazo(
        yaMando ? "modelo_ya_resuelto" : "modelo_va_al_catalogo",
        yaMando
          ? "Ya le mandaste el catálogo. Por un modelo, color o estilo no se deriva: decile que la disponibilidad se " +
            "confirma en el turno con el asesor, y que ahí le muestran todas las opciones para su fecha."
          : "Por un modelo, un color, un estilo o una foto no se deriva: mandá el catálogo online (enviar_link, tipo web) " +
            "y aclarale que la disponibilidad depende del talle y de la fecha del alquiler; en la visita el equipo le " +
            "muestra lo que hay para su fecha.",
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
    // hace de red de contención — antes eso quedaba en [] sin más. textoDeDerivacion nunca
    // devuelve vacío (hallazgo de logica, 19/9): si la fila de contexto_agente está en blanco,
    // cae al respaldo de código en vez de dejar al cliente mudo de nuevo.
    let textoAlCliente: string;
    let usoRespaldo = false;
    const claveFija = TEXTO_FIJO_DEL_MOTIVO[args.motivo];
    if (sinDespedida) {
      ({ texto: textoAlCliente, usoRespaldo } = await textoDeDerivacion(ctx.db, CLAVE_TEXTO_DERIVACION_RECLAMO));
    } else if (claveFija) {
      ({ texto: textoAlCliente, usoRespaldo } = await textoDeDerivacion(ctx.db, claveFija));
    } else if (mensaje) {
      textoAlCliente = mensaje;
    } else {
      ({ texto: textoAlCliente, usoRespaldo } = await textoDeDerivacion(ctx.db, CLAVE_TEXTO_DERIVACION_DURA_GENERICA));
    }
    const datos: Record<string, unknown> = {
      derivacion_id: id,
      nota: sinDespedida || claveFija
        ? `Con motivo ${args.motivo} tu despedida no se manda: la reemplaza un texto fijo, sigue una persona. No escribas nada más.`
        : "La charla quedó en manos del equipo. No escribas nada más.",
    };
    if (yaEstaba) datos.ya_estaba_derivada = true;
    if (usoRespaldo) datos.falta = "la fila de contexto_agente de esta derivación está vacía: se usó el respaldo de código";
    return {
      ok: true,
      datos,
      efectos: {
        cortaTurno: true,
        mensajesAlCliente: [textoAlCliente],
        avisoEquipo: { motivo: args.motivo, derivacionId: id },
      },
    };
  },
};
