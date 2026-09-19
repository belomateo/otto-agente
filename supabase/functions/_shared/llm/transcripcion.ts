// Transcripción de audio (pedido de Mateo, 19/9: que Lucía pueda leer audios). Multipart, no
// JSON como el resto de cliente.ts — por eso es un archivo aparte y no una función más ahí:
// el propio comentario de cliente.ts dice "para los cuatro usos de STACK.md § 3", y esto es un
// quinto uso con una forma de pedido distinta (form-data, no `messages`).
//
// Mismo criterio de reintento que llamarChat: 1 reintento con backoff, apiKey() ANTES del try
// (si falta la clave, tira ahí mismo, sin reintentar ni disfrazarse de error de red — ver el
// comentario de cliente.ts, hallazgo de la auditoría del 17/9, mismo razonamiento acá).

import { apiKey } from "./cliente.ts";

const URL_TRANSCRIPCIONES = "https://api.openai.com/v1/audio/transcriptions";
const TIMEOUT_MS = 20_000;
const ESPERA_ENTRE_REINTENTOS_MS = 800;

export type ResultadoTranscripcion = { texto: string; ms: number };

const EXTENSION_POR_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
};

async function unaTranscripcion(
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  modelo: string,
  fetcher: typeof fetch,
  clave: string,
): Promise<ResultadoTranscripcion> {
  const t0 = performance.now();
  const extension = EXTENSION_POR_MIME[mime.split(";")[0].trim().toLowerCase()] ?? "ogg";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), `audio.${extension}`);
  form.append("model", modelo);
  form.append("response_format", "json");
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetcher(URL_TRANSCRIPCIONES, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}` },
      body: form,
      signal: controlador.signal,
    });
  } finally {
    clearTimeout(corte);
  }
  const ms = Math.round(performance.now() - t0);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`OpenAI transcripción (${modelo}) respondió ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 500)}`);
  }
  return { texto: typeof j.text === "string" ? j.text.trim() : "", ms };
}

// null = falló la llamada y ya reintentó una vez — el llamador decide qué hacer (mismo contrato
// que llamarChat: nunca lanza por un error de red/HTTP, así que un audio que no se pudo
// transcribir no tira el turno entero).
export async function transcribir(
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoTranscripcion | null> {
  const clave = apiKey();
  const modelo = Deno.env.get("LLM_TRANSCRIPCION") ?? "";
  try {
    return await unaTranscripcion(bytes, mime, modelo, fetcher, clave);
  } catch (primerError) {
    await new Promise((res) => setTimeout(res, ESPERA_ENTRE_REINTENTOS_MS));
    try {
      return await unaTranscripcion(bytes, mime, modelo, fetcher, clave);
    } catch (segundoError) {
      console.error(`transcribir(${modelo}): falló dos veces.`, primerError, segundoError);
      return null;
    }
  }
}
