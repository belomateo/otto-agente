// Los audios y las fotos que MANDA EL CLIENTE. Es el camino inverso al de enviar.ts: allá se
// sube una foto a Meta para mandarla, acá se baja lo que llegó para poder leerlo y mostrarlo.
//
// POR QUÉ SE COPIA Y NO SE LINKEA. El webhook de Meta trae una URL directa al archivo, pero
// vence: en el primer audio real que llegó, el parámetro `ext` de esa URL daba 302 segundos
// después del timestamp del mensaje. Cinco minutos. Sirve para el worker que corre en el
// momento, y para nada más — una charla abierta al otro día tendría el link muerto. Por eso el
// archivo se copia al bucket `adjuntos` (privado) y todo lo demás sale de ahí.
//
// El media id, en cambio, dura ~30 días y sirve para pedir una URL nueva. Es lo que hace que una
// descarga fallida se pueda reintentar, y por eso se guarda en mensajes.adjunto_media_id (0055).

import type { Db } from "../db.ts";

export type ConfigMedios = { token: string; version?: string };
// Misma forma que worker/adjuntos.ts: <SUPABASE_URL>/storage/v1/object/adjuntos/ + la clave de
// servicio. Se declara acá para no importar nada de worker/ desde _shared/.
export type AccesoStorage = { base: string; clave: string };

export type MedioBajado = { bytes: Uint8Array<ArrayBuffer>; mime: string };

// 20 MB. WhatsApp acepta hasta 16 MB en audio y video y hasta 100 MB en documentos; una Edge
// Function que se trae 100 MB a memoria se muere sin decir por qué. Preferimos un 'error' con
// motivo legible antes que un worker que se cae.
export const TOPE_BYTES = 20 * 1024 * 1024;

// Lo que se baja hoy. Video y documento quedan afuera a propósito: Mateo pidió audios e
// imágenes, y son los dos que entran cómodos en memoria. Los demás no se bajan pero SÍ se
// registran como 'error' con motivo, para que en el CRM se vea que el cliente mandó algo —
// que no aparezca nada sería peor que un cartel.
export const TIPOS_QUE_BAJAMOS = new Set(["audio", "image", "sticker"]);

const BASE_MIME = (mime: string) => mime.split(";")[0].trim().toLowerCase();

// La extensión con la que se guarda. No se usa para nada funcional (el mime manda), pero un
// bucket lleno de archivos sin extensión es imposible de mirar a mano cuando algo falla.
export function extensionDe(mime: string): string {
  const porMime: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return porMime[BASE_MIME(mime)] ?? "bin";
}

// Duración de un Ogg/Opus, que es lo que manda WhatsApp en una nota de voz. NO viene en el
// webhook (verificado contra el payload real: el objeto `audio` trae id, voice, mime_type,
// sha256 y url, y nada más), así que si la queremos hay que sacarla del archivo.
//
// En Ogg, cada página arranca con "OggS" y trae en los bytes 6..13 el `granule position`: para
// Opus, la cantidad de muestras a 48 kHz acumuladas hasta esa página. O sea que la última página
// del archivo tiene el total, y dividido 48000 da los segundos. Se ignora el pre-skip del
// OpusHead (unos 80 ms): para mostrar "0:42" al lado de un reproductor no cambia nada.
//
// Devuelve null ante cualquier cosa rara. Nada depende de esto: es un lujo, no un requisito.
export function duracionOpusSegundos(bytes: Uint8Array<ArrayBuffer>): number | null {
  try {
    // Se busca "OggS" desde el final: la última página es la que trae el total.
    for (let i = bytes.length - 4; i >= 0; i--) {
      if (bytes[i] !== 0x4f || bytes[i + 1] !== 0x67 || bytes[i + 2] !== 0x67 || bytes[i + 3] !== 0x53) continue;
      if (i + 14 > bytes.length) continue;
      // 8 bytes little-endian desde el offset 6 de la página.
      let muestras = 0n;
      for (let b = 7; b >= 0; b--) muestras = (muestras << 8n) | BigInt(bytes[i + 6 + b]);
      if (muestras <= 0n) continue;
      const segundos = Math.round(Number(muestras) / 48000);
      // Un audio de WhatsApp de más de 2 horas no existe: si sale eso, leímos cualquier cosa.
      return segundos > 0 && segundos < 7200 ? segundos : null;
    }
    return null;
  } catch {
    return null;
  }
}

// Paso 1 de 2: el media id → la URL temporal y el mime, preguntándole a Meta. Se hace siempre
// esta llamada en vez de usar la URL que venía en el webhook, porque esa ya puede estar vencida
// (5 minutos) y porque así el mismo código sirve para un reintento de mañana.
async function urlDelMedio(cfg: ConfigMedios, mediaId: string, fetcher: typeof fetch) {
  const url = `https://graph.facebook.com/${cfg.version ?? "v21.0"}/${encodeURIComponent(mediaId)}`;
  const res = await fetcher(url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta no dio la URL del medio (${res.status}): ${JSON.stringify(datos?.error ?? datos)}`);
  const link = datos?.url;
  if (typeof link !== "string") throw new Error("Meta no devolvió la URL del medio");
  return { link, mime: typeof datos?.mime_type === "string" ? datos.mime_type : "", bytes: Number(datos?.file_size ?? 0) };
}

// Paso 2 de 2: bajar los bytes. La URL de lookaside pide el mismo Bearer que el resto de la API
// —sin el header contesta 401— y además un User-Agent: sin él Meta llega a devolver 400.
export async function bajarMedioDeMeta(
  cfg: ConfigMedios,
  mediaId: string,
  fetcher: typeof fetch = fetch,
): Promise<MedioBajado> {
  if (!cfg.token) throw new Error("falta WA_ACCESS_TOKEN para bajar medios");
  const { link, mime, bytes: declarados } = await urlDelMedio(cfg, mediaId, fetcher);
  if (declarados > TOPE_BYTES) {
    throw new Error(`el archivo pesa ${Math.round(declarados / 1024 / 1024)} MB y el tope es ${TOPE_BYTES / 1024 / 1024} MB`);
  }
  const res = await fetcher(link, {
    headers: { Authorization: `Bearer ${cfg.token}`, "User-Agent": "otto-agente/1.0" },
  });
  if (!res.ok) throw new Error(`no se pudo bajar el medio de Meta (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // El tamaño declarado puede mentir o venir en 0: se vuelve a chequear con lo que llegó.
  if (buf.byteLength > TOPE_BYTES) {
    throw new Error(`el archivo pesa ${Math.round(buf.byteLength / 1024 / 1024)} MB y el tope es ${TOPE_BYTES / 1024 / 1024} MB`);
  }
  if (buf.byteLength === 0) throw new Error("Meta devolvió un archivo vacío");
  return { bytes: buf, mime: mime || res.headers.get("content-type") || "application/octet-stream" };
}

const rutaCodificada = (ruta: string) => ruta.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");

// Guarda en el bucket `adjuntos` (privado). x-upsert para que un reintento pise lo anterior en
// vez de fallar con "ya existe": la ruta se deriva del id del mensaje, así que reescribir el
// mismo archivo es exactamente lo que queremos.
export async function guardarEnStorage(
  a: AccesoStorage,
  ruta: string,
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!a.base || !a.clave) throw new Error("falta la configuración del bucket de adjuntos");
  const res = await fetcher(a.base + rutaCodificada(ruta), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${a.clave}`,
      apikey: a.clave,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    // Blob y no el Uint8Array pelado: Deno lo acepta igual en runtime, pero desde las libs
    // nuevas de TS un Uint8Array no tipa como BodyInit y `deno check` lo rechaza.
    body: new Blob([bytes], { type: mime }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`no se pudo guardar el adjunto en el bucket (${res.status}) ${detalle.slice(0, 200)}`);
  }
}

// Para quien necesite los bytes después de guardados — el agente, para transcribir. Así no tiene
// que saber nada de Storage ni de Meta: pide la ruta que quedó en mensajes.adjunto_path y listo.
export async function leerDeStorage(
  a: AccesoStorage,
  ruta: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!a.base || !a.clave) throw new Error("falta la configuración del bucket de adjuntos");
  const res = await fetcher(a.base + rutaCodificada(ruta), {
    headers: { Authorization: `Bearer ${a.clave}`, apikey: a.clave },
  });
  if (!res.ok) throw new Error(`no se pudo leer el adjunto del bucket (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// El adjunto de un mensaje, listo para usar: los bytes si están, y si no, POR QUÉ no están.
//
// Los tres estados son distintos y la diferencia importa para qué contestarle al cliente:
//   'listo'     → los bytes, el mime y la duración si se pudo calcular.
//   'pendiente' → todavía no se bajó. El worker baja hasta MAX_ADJUNTOS_POR_TURNO por turno, así
//                 que en una ráfaga con muchos adjuntos los últimos quedan para el turno que
//                 viene. NO es un fallo: el archivo va a estar. Contestar «no pude leerlo» acá
//                 sería mentir.
//   'error'     → no se pudo bajar y no se va a bajar solo. Hace falta que alguien lo reintente
//                 desde el panel (el media id sigue guardado y sirve ~30 días).
//   null        → el mensaje no tiene adjunto: es texto común.
export type AdjuntoDeMensaje =
  | { estado: "listo"; bytes: Uint8Array<ArrayBuffer>; mime: string; segundos: number | null; esVoz: boolean }
  | { estado: "pendiente" | "error"; detalle: string | null }
  | { estado: "sin_adjunto" };

export async function leerAdjunto(db: Db, a: AccesoStorage, mensajeId: string, fetcher: typeof fetch = fetch): Promise<AdjuntoDeMensaje> {
  const [m] = await db.consulta<{
    adjunto_estado: string | null;
    adjunto_path: string | null;
    adjunto_mime: string | null;
    adjunto_segundos: number | null;
    adjunto_voz: boolean | null;
    adjunto_detalle: string | null;
  }>(
    `select adjunto_estado, adjunto_path, adjunto_mime, adjunto_segundos, adjunto_voz, adjunto_detalle
       from mensajes where id = $1::uuid`,
    [mensajeId],
  );
  if (!m || !m.adjunto_estado) return { estado: "sin_adjunto" };
  if (m.adjunto_estado !== "listo" || !m.adjunto_path) {
    return { estado: m.adjunto_estado === "pendiente" ? "pendiente" : "error", detalle: m.adjunto_detalle };
  }
  try {
    return {
      estado: "listo",
      bytes: await leerDeStorage(a, m.adjunto_path, fetcher),
      mime: m.adjunto_mime ?? "application/octet-stream",
      segundos: m.adjunto_segundos,
      esVoz: m.adjunto_voz === true,
    };
  } catch (e) {
    // La fila dice 'listo' pero el archivo no está: alguien lo borró del bucket, o la subida
    // mintió. Se devuelve como error en vez de explotar, porque el turno tiene que seguir.
    return { estado: "error", detalle: String((e as Error)?.message ?? e) };
  }
}

// Dónde vive el archivo de un mensaje. Se deriva del id del mensaje y no de un nombre al azar:
// así es idempotente (un reintento pisa el mismo archivo, no deja basura) y desde una ruta se
// llega siempre a la fila que la explica. El prefijo `entrantes/` la separa de las fotos que
// sube el equipo desde el panel, que comparten bucket.
export const rutaDelAdjunto = (conversacionId: string, mensajeId: string, mime: string) =>
  `entrantes/${conversacionId}/${mensajeId}.${extensionDe(mime)}`;
