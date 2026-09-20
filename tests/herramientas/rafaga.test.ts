// agrupar_rafaga (AGENTE.md § 3 paso 3), el campo soloNoTexto (supuesto #33, H2.1, 15/9) y los
// botones (auditoría de Mateo, 15/9): si lo único que llegó en la ventana no es texto (foto,
// audio, sticker...), no es lo mismo que "no pasó nada" — turno.ts lo usa para no quedarse en
// silencio. Un botón de plantilla ("Necesito reprogramar") SÍ cuenta como texto: no es una foto,
// es una frase que el cliente tocó en vez de escribir (el de "Confirmo" nunca llega acá: se
// resuelve antes, en atender.ts, sin correr el turno).

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { agruparRafaga, MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA, MAXIMO_CARACTERES_RAFAGA } from "../../supabase/functions/_shared/turno/rafaga.ts";
import type { AccesoStorage } from "../../supabase/functions/_shared/whatsapp/medios.ts";
import { AHORA, prueba } from "./_arnes.ts";

async function insertar(
  sql: import("npm:pg@8.13.1").Client,
  conversacionId: string,
  p: { direccion: "entrante" | "saliente"; tipo: string; contenido: string | null; enviadoAt: Date },
) {
  await sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, $2, $3, $4, $5::timestamptz)",
    [conversacionId, p.direccion, p.tipo, p.contenido, p.enviadoAt.toISOString()],
  );
}

prueba("agrupar_rafaga: nada nuevo en la ventana no es soloNoTexto (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: un mensaje de texto normal no es soloNoTexto (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "hola", enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "hola");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: solo una foto sin epígrafe es soloNoTexto, sin texto", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "image", contenido: null, enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "");
  assertEquals(r.soloNoTexto, true);
  assert(r.ultimoEnviadoAt, "aunque no sea texto, la barandilla fuera_ventana_meta necesita saber cuándo escribió");
});

prueba("agrupar_rafaga: audio y sticker juntos, sin texto, siguen siendo soloNoTexto", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "audio", contenido: null, enviadoAt: AHORA });
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "sticker", contenido: null, enviadoAt: new Date(AHORA.getTime() + 1000) });
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + 2000));
  assertEquals(r.texto, "");
  assertEquals(r.soloNoTexto, true);
});

prueba("agrupar_rafaga: una foto con epígrafe Y un mensaje de texto en la misma ráfaga: gana el texto (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "image", contenido: "esto es lo que quiero", enviadoAt: AHORA });
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "les mando la foto", enviadoAt: new Date(AHORA.getTime() + 1000) });
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + 2000));
  assertEquals(r.texto, "les mando la foto");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: el botón «Necesito reprogramar» cuenta como texto, no como soloNoTexto", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "button", contenido: "Necesito reprogramar", enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "Necesito reprogramar");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: un texto corto no se toca (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "hola, necesito un turno", enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.recortada, false);
  assertEquals(r.texto, "hola, necesito un turno");
});

prueba("agrupar_rafaga: una ráfaga que pasa el tope se recorta antes del clasificador y el principal, en el espacio, no a la mitad de una palabra (hallazgo de Mateo y de logica, 16/9)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "a".repeat(2000), enviadoAt: AHORA });
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "b".repeat(2000), enviadoAt: new Date(AHORA.getTime() + 1000) });
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + 2000));
  assertEquals(r.recortada, true);
  // El salto de línea entre los dos mensajes cae en el tramo (2000 "a" + "\n" + 499 "b" = 2500):
  // ese es el único espacio del tramo, así que el corte cae ahí y se pierde el segundo mensaje
  // entero en vez de partirlo a la mitad.
  assertEquals(r.texto, "a".repeat(2000));
});

prueba("agrupar_rafaga: un mensaje único y largo también se recorta, en el espacio anterior a la palabra que cruza el tope (hallazgo de logica, 16/9)", async ({ ctx, sql, conversacionId }) => {
  // Una palabra de 20 caracteres cruzando la posición 2500 (2490 caracteres + espacio + palabra):
  // sin el corte en el espacio, "yyyyyyyyyy" quedaría partida a la mitad.
  const texto = "x".repeat(2490) + " " + "y".repeat(20);
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: texto, enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.recortada, true);
  assertEquals(r.texto, "x".repeat(2490));
  assert(!r.texto.includes("y"), "no dejó ni un pedazo de la palabra cortada a la mitad");
});

prueba("agrupar_rafaga: sin ningún espacio en el tramo, se mantiene el corte seco (caso parecido, de laboratorio)", async ({ ctx, sql, conversacionId }) => {
  const texto = "x".repeat(3000); // una sola "palabra" gigantesca, sin espacios
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: texto, enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.recortada, true);
  assertEquals([...r.texto].length, MAXIMO_CARACTERES_RAFAGA);
});

prueba("agrupar_rafaga: un emoji justo en el borde del tope no se parte a la mitad", async ({ ctx, sql, conversacionId }) => {
  const texto = "a".repeat(MAXIMO_CARACTERES_RAFAGA - 1) + "😊😊";
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: texto, enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.recortada, true);
  assertEquals([...r.texto].length, MAXIMO_CARACTERES_RAFAGA);
  assertEquals(r.texto, "a".repeat(MAXIMO_CARACTERES_RAFAGA - 1) + "😊");
});

// ── Pedido de Mateo, 19/9: que Lucía lea audios e imágenes ──────────────────────────────────

const ACCESO_DE_PRUEBA: AccesoStorage = { base: "https://storage.prueba.local/adjuntos/", clave: "clave-de-prueba" };

async function insertarAdjunto(
  sql: import("npm:pg@8.13.1").Client,
  conversacionId: string,
  p: {
    tipo: "audio" | "image";
    contenido?: string | null;
    enviadoAt: Date;
    estado: "listo" | "pendiente" | "error";
    segundos?: number | null;
  },
) {
  const r = await sql.query(
    `insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at,
                           adjunto_media_id, adjunto_path, adjunto_mime, adjunto_estado, adjunto_segundos)
     values ($1, 'entrante', $2, $3, $4::timestamptz, 'media-de-prueba', $5, $6, $7, $8)
     returning id::text as id`,
    [
      conversacionId,
      p.tipo,
      p.contenido ?? null,
      p.enviadoAt.toISOString(),
      p.estado === "listo" ? `entrantes/${conversacionId}/prueba.bin` : null,
      p.tipo === "audio" ? "audio/ogg" : "image/jpeg",
      p.estado,
      p.segundos ?? null,
    ],
  );
  return r.rows[0].id as string;
}

// Responde tanto al GET del bucket (Storage) como al POST de transcripción (OpenAI), según la
// URL — el mismo fetcher se lo pasa agruparRafaga a las dos cosas.
function fetcherDeAdjuntos(
  p: { bytesDelArchivo?: Uint8Array<ArrayBuffer>; textoTranscripto?: string; fallaTranscripcion?: boolean } = {},
): typeof fetch {
  const bytes = p.bytesDelArchivo ?? new Uint8Array([1, 2, 3, 4]);
  return (async (url: string) => {
    const u = String(url);
    if (u.includes("audio/transcriptions")) {
      if (p.fallaTranscripcion) return new Response(JSON.stringify({ error: "de prueba" }), { status: 500 });
      return new Response(JSON.stringify({ text: p.textoTranscripto ?? "" }), { status: 200 });
    }
    if (u.startsWith(ACCESO_DE_PRUEBA.base)) return new Response(new Blob([bytes]), { status: 200 });
    throw new Error(`la prueba no esperaba pedir ${u}`);
  }) as unknown as typeof fetch;
}

prueba("agrupar_rafaga: un audio 'listo' se transcribe y entra como texto etiquetado", async ({ ctx, sql, conversacionId }) => {
  const id = await insertarAdjunto(sql, conversacionId, { tipo: "audio", enviadoAt: AHORA, estado: "listo", segundos: 5 });
  const fetcher = fetcherDeAdjuntos({ textoTranscripto: "hola quiero un turno para el sábado" });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA, { acceso: ACCESO_DE_PRUEBA, fetcher });
  assertEquals(r.texto, "Cliente (audio, transcripción automática, puede tener errores): hola quiero un turno para el sábado");
  assertEquals(r.soloNoTexto, false);
  assertEquals(r.hayAdjuntoPendiente, false);
  assertEquals(r.hayAdjuntoNoLegible, false);
  assertEquals(r.llamadasLlm.length, 1);
  assert(r.llamadasLlm[0].costoUsdDirecto! > 0, "5 segundos de audio tienen que costar algo, no 0");
  const [fila] = (await sql.query("select transcripcion from mensajes where id = $1", [id])).rows;
  assertEquals(fila.transcripcion, "hola quiero un turno para el sábado");
});

prueba("agrupar_rafaga: una imagen 'lista' se arma en base64 con su epígrafe", async ({ ctx, sql, conversacionId }) => {
  await insertarAdjunto(sql, conversacionId, { tipo: "image", contenido: "¿tienen este traje?", enviadoAt: AHORA, estado: "listo" });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA, { acceso: ACCESO_DE_PRUEBA, fetcher: fetcherDeAdjuntos() });
  assertEquals(r.imagenes.length, 1);
  assert(r.imagenes[0].url.startsWith("data:image/jpeg;base64,"), `la url no es un data URI: ${r.imagenes[0].url.slice(0, 40)}`);
  assertEquals(r.imagenes[0].epigrafe, "¿tienen este traje?");
  assertEquals(r.soloNoTexto, false);
  assertEquals(r.llamadasLlm.length, 0, "una imagen no transcribe nada, no gasta en el LLM de audio");
});

prueba("agrupar_rafaga: un adjunto 'pendiente' no es un error — se lee en el próximo turno", async ({ ctx, sql, conversacionId }) => {
  await insertarAdjunto(sql, conversacionId, { tipo: "audio", enviadoAt: AHORA, estado: "pendiente" });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA, { acceso: ACCESO_DE_PRUEBA, fetcher: fetcherDeAdjuntos() });
  assertEquals(r.hayAdjuntoPendiente, true);
  assertEquals(r.hayAdjuntoNoLegible, false);
  assertEquals(r.soloNoTexto, true);
  assertEquals(r.texto, "");
});

prueba("agrupar_rafaga: un adjunto 'error' (bajada fallida) queda como no legible", async ({ ctx, sql, conversacionId }) => {
  await insertarAdjunto(sql, conversacionId, { tipo: "audio", enviadoAt: AHORA, estado: "error" });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA, { acceso: ACCESO_DE_PRUEBA, fetcher: fetcherDeAdjuntos() });
  assertEquals(r.hayAdjuntoPendiente, false);
  assertEquals(r.hayAdjuntoNoLegible, true);
  assertEquals(r.soloNoTexto, true);
});

prueba("agrupar_rafaga: una transcripción que falla (o vuelve vacía) también queda como no legible, no rompe el turno", async ({ ctx, sql, conversacionId }) => {
  await insertarAdjunto(sql, conversacionId, { tipo: "audio", enviadoAt: AHORA, estado: "listo" });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA, { acceso: ACCESO_DE_PRUEBA, fetcher: fetcherDeAdjuntos({ fallaTranscripcion: true }) });
  assertEquals(r.hayAdjuntoNoLegible, true);
  assertEquals(r.texto, "");
  assertEquals(r.llamadasLlm.length, 0, "una transcripción fallida no se registra como consumo");
});

// Pedido de logica (punto d, 19/9): "cliente manda 40 audios" no puede gastar 40 transcripciones.
// Mismo tope que bajarMediosPendientes del lado de la descarga (MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA).
prueba("agrupar_rafaga: más adjuntos que el tope por ráfaga — los de más no se procesan", async ({ ctx, sql, conversacionId }) => {
  const cantidad = MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA + 2;
  for (let i = 0; i < cantidad; i++) {
    await insertarAdjunto(sql, conversacionId, { tipo: "audio", enviadoAt: new Date(AHORA.getTime() + i * 1000), estado: "listo" });
  }
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + cantidad * 1000), {
    acceso: ACCESO_DE_PRUEBA,
    fetcher: fetcherDeAdjuntos({ textoTranscripto: "hola" }),
  });
  assertEquals(r.llamadasLlm.length, MAXIMO_ADJUNTOS_LEGIBLES_POR_RAFAGA);
  assertEquals(r.adjuntosDeMas, 2);
});

prueba("agrupar_rafaga: sin acceso al bucket (el emulador), un audio/imagen queda como no legible, sin romper", async ({ ctx, sql, conversacionId }) => {
  await insertarAdjunto(sql, conversacionId, { tipo: "audio", enviadoAt: AHORA, estado: "listo" });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA); // sin opciones: como el emulador
  assertEquals(r.hayAdjuntoNoLegible, true);
  assertEquals(r.soloNoTexto, true);
});
