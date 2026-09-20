// agrupar_rafaga (AGENTE.md § 3 paso 3): si el cliente mandó varios mensajes seguidos, se
// contestan juntos. La ESPERA de 4 s es responsabilidad del worker (cuándo conviene llamar a
// esto: Fase 2, logica) — lo que es código puro y se puede probar sin dormir nada es CUÁLES
// mensajes van juntos: todos los entrantes desde el último saliente (o desde el principio de la
// conversación) hasta ahora, en orden, unidos con saltos de línea. Por eso `probar-agente` y el
// worker real llaman a esto mismo antes de correr el turno.
//
// Pedido de Mateo, 19/9: que Lucía pueda leer audios e imágenes. Esto ya NO es código puro (el
// comentario de arriba lo era hasta acá): si hay un audio/imagen 'listo' (leerAdjunto, de
// medios.ts — lo baja el worker ANTES de llamar a esto, con tope de 4 adjuntos/10 s por turno),
// el audio se transcribe (una llamada real a OpenAI) y la transcripción se guarda en
// mensajes.transcripcion; la imagen se arma en base64 para que el modelo la vea directo, sin
// pasar por una URL firmada del bucket privado. `acceso`/`fetcher` son opcionales: sin ellos
// (el emulador, que no tiene Storage ni Meta) cualquier adjunto queda como "no legible".

import type { Db } from "../db.ts";
import { costoTranscripcionUsd } from "../llm/precios.ts";
import type { LlamadaLlm } from "../llm/principal.ts";
import { transcribir } from "../llm/transcripcion.ts";
import { type AccesoStorage, leerAdjunto } from "../whatsapp/medios.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

export type MensajeEntrante = { id: string; contenido: string; enviadoAt: Date };

// Tipos de mensaje que se leen como texto de verdad. 'texto' es lo normal; 'button' es la
// respuesta a un botón de una plantilla (H1.14) — Meta manda el label que tocó el cliente como
// contenido ("Necesito reprogramar"). El de "Confirmo" nunca llega hasta acá: atender.ts lo
// resuelve antes, en código, sin correr el turno. El de "Necesito reprogramar" sí sigue de largo
// (queda anotado y el turno corre igual, AGENTE.md § 3): antes de este arreglo cascase acá como
// "no es texto" y Lucía contestaba que no puede leer fotos — un botón no es una foto, es una
// frase que el cliente eligió tocar en vez de escribir, y reprogramar_turno la resuelve igual
// que si la hubiera tipeado.
export const TIPOS_QUE_SON_TEXTO = ["texto", "button"];

// Lo que Mateo pidió que Lucía pueda leer (19/9): audio (transcripción) e imagen (visión). Otros
// tipos con adjunto (sticker, video, documento) se bajan igual (medios.ts, para el CRM) pero
// Lucía no los interpreta — no los pidió, y "leer" un sticker no tiene mucho sentido.
export const TIPOS_CON_ADJUNTO_LEGIBLE = ["audio", "image"];

// Hallazgo de Mateo, 16/9: sin tope, una ráfaga larga (un cliente que pega un texto gigante, o
// que no para de escribir) se mandaba entera al clasificador y al principal — costo y riesgo de
// pasarse del contexto del modelo sin ningún límite. 2500 caracteres alcanza de sobra para
// cualquier mensaje real (el propio prompt, con todo lo que dice Lucía, entra en 300 líneas).
// Decisión (hallazgo de logica, 16/9): 2500 es MENOS que los 4096 que permite un mensaje de
// WhatsApp, así que esto SÍ puede recortar un único mensaje legítimo si es lo bastante largo, no
// solo una ráfaga de varios — el costo de mandarlo entero al clasificador y al principal es el
// mismo, venga de uno o de varios mensajes, y es justo lo que este tope existe para evitar.
export const MAXIMO_CARACTERES_RAFAGA = 2500;

// Pedido de logica (punto d de sus 4 preocupaciones, 19/9): "cliente manda 40 audios" no puede
// gastar 40 transcripciones. bajarMediosPendientes() ya tope a 4 por turno del lado de la
// descarga; este tope es el mismo número del lado de la lectura, para que los números conversen.
export const MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA = 4;

export type ImagenParaElModelo = { url: string; epigrafe: string | null };

export type Rafaga = {
  texto: string;
  imagenes: ImagenParaElModelo[];
  mensajeIds: string[];
  // El corte para el historial (historial.ts): todo lo que pasó HASTA acá (inclusive) es
  // contexto de turnos anteriores; lo que sigue es la ráfaga de este turno, que ya va aparte
  // como el mensaje actual. Sin este corte, el mensaje de ahora aparecería dos veces.
  desde: Date;
  ultimoEnviadoAt: Date | null; // para la barandilla fuera_ventana_meta
  // Supuesto #33: si no hay NADA legible (ni texto, ni imagen, ni audio transcripto) pero SÍ
  // hubo algo entrante en la ventana, no es lo mismo que "no pasó nada" — turno.ts contesta con
  // el texto fijo de contexto_agente en vez de quedarse en silencio.
  soloNoTexto: boolean;
  // Al menos un adjunto todavía se está bajando (el worker le puso un tope de tiempo/cantidad a
  // bajarMediosPendientes y este quedó para el turno que viene). NO es un error: decir "no pude
  // leerlo" acá sería mentir, porque sí se va a leer. turno.ts contesta distinto a esto.
  hayAdjuntoPendiente: boolean;
  // Al menos un adjunto que se intentó leer y no se pudo (bajada fallida, transcripción vacía o
  // fallida) o que llegó de un tipo que Lucía no interpreta (sticker, video, documento).
  hayAdjuntoNoLegible: boolean;
  // Se pasó de MAXIMO_CARACTERES_RAFAGA: turno.ts lo deja en la bitácora, para que quede rastro
  // de que se cortó algo (principio 9: la verdad es lo que queda en la base).
  recortada: boolean;
  // Cuántos adjuntos se resignaron sin procesar por MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA, para que
  // turno.ts se lo pueda decir al cliente ("de a una, así te presto atención a cada una").
  adjuntosDeMas: number;
  // Las transcripciones que se hicieron en esta ráfaga, listas para consumo_llm (bitacora.ts) —
  // no son llamadas al LLM_PRINCIPAL/CLASIFICADOR/EXTRACTOR, pero gastan igual y tienen que verse.
  llamadasLlm: LlamadaLlm[];
};

const CLAVE_MODELO_TRANSCRIPCION = () => Deno.env.get("LLM_TRANSCRIPCION") ?? "";

// Etiquetada como lo que es (pedido de logica, 19/9: "cliente, modelo y equipo ven la misma
// advertencia"), para que el modelo la trate con el escepticismo que corresponde por diseño de
// prompt, no por lógica frágil tratando de detectar una transcripción "dudosa".
const etiquetaDeAudio = (texto: string) => `Cliente (audio, transcripción automática, puede tener errores): ${texto}`;

async function resolverAdjunto(
  db: Db,
  acceso: AccesoStorage,
  fila: { id: string; tipo: string },
  fetcher: typeof fetch,
): Promise<{ texto: string | null; imagenUrl: string | null; pendiente: boolean; noLegible: boolean; llamadaLlm: LlamadaLlm | null }> {
  const adjunto = await leerAdjunto(db, acceso, fila.id, fetcher);
  if (adjunto.estado !== "listo") {
    return adjunto.estado === "pendiente"
      ? { texto: null, imagenUrl: null, pendiente: true, noLegible: false, llamadaLlm: null }
      : { texto: null, imagenUrl: null, pendiente: false, noLegible: true, llamadaLlm: null };
  }
  if (fila.tipo === "image") {
    const imagenUrl = `data:${adjunto.mime};base64,${encodeBase64(adjunto.bytes)}`;
    return { texto: null, imagenUrl, pendiente: false, noLegible: false, llamadaLlm: null };
  }
  // audio
  const r = await transcribir(adjunto.bytes, adjunto.mime, fetcher);
  if (!r || !r.texto) return { texto: null, imagenUrl: null, pendiente: false, noLegible: true, llamadaLlm: null };
  await db.consulta("update mensajes set transcripcion = $1 where id = $2::uuid", [r.texto, fila.id]);
  const modelo = CLAVE_MODELO_TRANSCRIPCION();
  const llamadaLlm: LlamadaLlm = {
    modelo,
    uso: { tokensIn: 0, tokensOut: 0, tokensCacheados: 0 },
    ms: r.ms,
    costoUsdDirecto: adjunto.segundos !== null ? costoTranscripcionUsd(adjunto.segundos) : 0,
  };
  return { texto: etiquetaDeAudio(r.texto), imagenUrl: null, pendiente: false, noLegible: false, llamadaLlm };
}

export async function agruparRafaga(
  db: Db,
  conversacionId: string,
  ahora: Date,
  opciones: { acceso?: AccesoStorage; fetcher?: typeof fetch } = {},
): Promise<Rafaga> {
  const ultimoSaliente = await db.consulta<{ enviado_at: string }>(
    `select enviado_at from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at desc limit 1`,
    [conversacionId],
  );
  const desdeIso = ultimoSaliente[0]?.enviado_at ?? "1970-01-01T00:00:00Z";
  const filas = await db.consulta<{ id: string; contenido: string | null; tipo: string; enviado_at: string }>(
    `select id::text as id, contenido, tipo, enviado_at from mensajes
      where conversacion_id = $1 and direccion = 'entrante' and tipo = any($2::text[])
        and enviado_at > $3::timestamptz and enviado_at <= $4::timestamptz
      order by enviado_at, id`,
    [conversacionId, [...TIPOS_QUE_SON_TEXTO, ...TIPOS_CON_ADJUNTO_LEGIBLE], desdeIso, ahora.toISOString()],
  );
  let ultimoEnviadoAt = filas.length ? new Date(filas[filas.length - 1].enviado_at) : null;
  if (filas.length === 0) {
    const [otros] = await db.consulta<{ n: number; ultimo: string | null }>(
      `select count(*)::int as n, max(enviado_at) as ultimo from mensajes
        where conversacion_id = $1 and direccion = 'entrante'
          and enviado_at > $2::timestamptz and enviado_at <= $3::timestamptz`,
      [conversacionId, desdeIso, ahora.toISOString()],
    );
    if (otros?.ultimo) ultimoEnviadoAt = new Date(otros.ultimo);
    return {
      texto: "",
      imagenes: [],
      mensajeIds: [],
      desde: new Date(desdeIso),
      ultimoEnviadoAt,
      soloNoTexto: (otros?.n ?? 0) > 0,
      hayAdjuntoPendiente: false,
      hayAdjuntoNoLegible: false,
      recortada: false,
      adjuntosDeMas: 0,
      llamadasLlm: [],
    };
  }

  const fetcher = opciones.fetcher ?? fetch;
  const partesDeTexto: string[] = [];
  const imagenes: ImagenParaElModelo[] = [];
  const llamadasLlm: LlamadaLlm[] = [];
  let hayAdjuntoPendiente = false;
  let hayAdjuntoNoLegible = false;
  let adjuntosDeMas = 0;
  let adjuntosProcesados = 0;
  for (const f of filas) {
    if (TIPOS_QUE_SON_TEXTO.includes(f.tipo)) {
      if (f.contenido !== null) partesDeTexto.push(f.contenido);
      continue;
    }
    // Adjunto (audio/image). Sin acceso al bucket (el emulador no tiene Storage ni Meta), no hay
    // forma de leerlo: mismo resultado que si hubiera fallado la bajada.
    if (!opciones.acceso) {
      hayAdjuntoNoLegible = true;
      continue;
    }
    if (adjuntosProcesados >= MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA) {
      adjuntosDeMas++;
      continue;
    }
    adjuntosProcesados++;
    const r = await resolverAdjunto(db, opciones.acceso, f, fetcher);
    if (r.pendiente) hayAdjuntoPendiente = true;
    if (r.noLegible) hayAdjuntoNoLegible = true;
    if (r.texto) partesDeTexto.push(r.texto);
    if (r.imagenUrl) imagenes.push({ url: r.imagenUrl, epigrafe: f.contenido });
    if (r.llamadaLlm) llamadasLlm.push(r.llamadaLlm);
  }

  const unido = partesDeTexto.join("\n");
  // [...t] recorre por code point (no por unidad UTF-16): un emoji de dos "caracteres" para
  // .length no se parte a la mitad.
  const puntos = [...unido];
  const recortada = puntos.length > MAXIMO_CARACTERES_RAFAGA;
  let texto = unido;
  if (recortada) {
    const corte = puntos.slice(0, MAXIMO_CARACTERES_RAFAGA);
    // Corta en el último espacio del tramo, no a la mitad de una palabra (hallazgo de logica,
    // 16/9). Si no hay ningún espacio (una sola palabra gigantesca, caso de laboratorio), no hay
    // mejor lugar: se mantiene el corte seco.
    let ultimoEspacio = -1;
    for (let i = corte.length - 1; i >= 0; i--) {
      if (/\s/.test(corte[i])) {
        ultimoEspacio = i;
        break;
      }
    }
    texto = (ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte).join("").trimEnd();
  }
  return {
    texto,
    imagenes,
    mensajeIds: filas.filter((f) => TIPOS_QUE_SON_TEXTO.includes(f.tipo)).map((f) => String(f.id)),
    desde: new Date(desdeIso),
    ultimoEnviadoAt,
    soloNoTexto: texto === "" && imagenes.length === 0,
    hayAdjuntoPendiente,
    hayAdjuntoNoLegible,
    recortada,
    adjuntosDeMas,
    llamadasLlm,
  };
}
