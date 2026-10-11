// El transcriptor (LLM_TRANSCRIPCION, llm/transcripcion.ts): pasa a texto los audios que manda el
// cliente, para que Lucía los lea como un mensaje más (pedido de Mateo, 19/9). Lo llama rafaga.ts
// cuando el worker ya bajó el audio; la transcripción entra al turno etiquetada «transcripción
// automática, puede tener errores» y queda guardada en mensajes.transcripcion.
// Trabajo 5 (pedido de Mateo, 10/10): una prueba para cada ayudante de Lucía.
//
// Parte simulada (siempre, sin base ni red): el pedido multipart a OpenAI, la lectura de la
// respuesta, el reintento, y qué pasa en la ráfaga y en el turno cuando la transcripción sale bien,
// sale vacía o falla: el turno nunca se cae, y si no queda nada legible contesta el texto fijo.
// Parte real (PRUEBA_MODELO_REAL=1): transcribe tests/subagentes/muestras/audio-corto.ogg. En el repo
// todavía no hay ningún audio de muestra, así que queda lista pero ignorada (ver abajo cómo sumarla).

import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { costoTranscripcionUsd } from "../../supabase/functions/_shared/llm/precios.ts";
import { transcribir } from "../../supabase/functions/_shared/llm/transcripcion.ts";
import { agruparRafaga, etiquetaDeAudio } from "../../supabase/functions/_shared/turno/rafaga.ts";
import { correrTurno } from "../../supabase/functions/_shared/turno/turno.ts";
import type { AccesoStorage } from "../../supabase/functions/_shared/whatsapp/medios.ts";
import { prepararParaEnviar } from "../../supabase/functions/_shared/whatsapp/preparar.ts";
import { llamar, openaiSimulado, type PedidoSimulado } from "../herramientas/_openai_simulado.ts";
import { BaseEnMemoria, exigirClaveDeOpenAI, FICHA_NULA, MODELO_REAL, simulada } from "./_comun.ts";

const URL_TRANSCRIPCIONES = "https://api.openai.com/v1/audio/transcriptions";
const AHORA = new Date("2026-10-10T15:00:00-03:00");
const TZ = "America/Argentina/Cordoba";
const BYTES = () => new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0]); // "OggS…": alcanza, nadie lo decodifica

type PedidoAudio = { url: string; init: RequestInit; form: FormData };
function openaiDeAudio(contestar: (n: number) => Response | Promise<Response>): { fetcher: typeof fetch; pedidos: PedidoAudio[] } {
  const pedidos: PedidoAudio[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), init: init ?? {}, form: init?.body as FormData });
    return await contestar(pedidos.length);
  }) as typeof fetch;
  return { fetcher, pedidos };
}
const texto = (t: unknown) => Response.json({ text: t });

// ── 1. El pedido y la respuesta ─────────────────────────────────────────────────────────────

simulada("pedido: multipart a /v1/audio/transcriptions con el archivo, el modelo y formato json", async () => {
  const { fetcher, pedidos } = openaiDeAudio(() => texto("hola"));
  await transcribir(BYTES(), "audio/ogg; codecs=opus", fetcher);
  assertEquals(pedidos.length, 1);
  const [p] = pedidos;
  assertEquals(p.url, URL_TRANSCRIPCIONES);
  assertEquals(p.init.method, "POST");
  const encabezados = new Headers(p.init.headers);
  assert(String(encabezados.get("authorization")).startsWith("Bearer "), "falta la clave en el pedido");
  // El Content-Type lo pone fetch con el boundary del multipart: si alguien lo fija a mano, se rompe.
  assertEquals(encabezados.get("content-type"), null);
  assert(p.init.signal instanceof AbortSignal, "sin señal de corte, un OpenAI colgado deja el turno esperando");
  assert(p.form instanceof FormData);
  const archivo = p.form.get("file") as File;
  assertEquals(archivo.name, "audio.ogg");
  assertEquals(archivo.type, "audio/ogg; codecs=opus");
  assertEquals(new Uint8Array(await archivo.arrayBuffer()), BYTES());
  assertEquals(p.form.get("model"), Deno.env.get("LLM_TRANSCRIPCION") ?? "");
  assertEquals(p.form.get("response_format"), "json");
});

simulada("pedido: el nombre del archivo lleva la extensión del tipo de audio (OpenAI la usa para saber cómo leerlo)", async () => {
  const casos: [string, string][] = [
    ["audio/ogg", "audio.ogg"],
    ["audio/ogg; codecs=opus", "audio.ogg"], // la nota de voz de WhatsApp
    ["audio/opus", "audio.ogg"],
    ["audio/mpeg", "audio.mp3"],
    ["AUDIO/MPEG", "audio.mp3"],
    ["audio/mp4", "audio.m4a"],
    ["audio/aac", "audio.aac"],
    ["audio/amr", "audio.amr"],
    ["audio/x-desconocido", "audio.ogg"],
  ];
  for (const [mime, nombre] of casos) {
    const { fetcher, pedidos } = openaiDeAudio(() => texto("hola"));
    await transcribir(BYTES(), mime, fetcher);
    assertEquals((pedidos[0].form.get("file") as File).name, nombre, mime);
  }
});

simulada("respuesta: el texto sin espacios de más, y cuánto tardó", async () => {
  const { fetcher } = openaiDeAudio(() => texto("  hola, quiero alquilar un traje para el 12 de diciembre  \n"));
  const r = await transcribir(BYTES(), "audio/ogg", fetcher);
  assert(r);
  assertEquals(r.texto, "hola, quiero alquilar un traje para el 12 de diciembre");
  assert(r.ms >= 0);
});

simulada("respuesta rara: sin texto, un texto que no es texto o un cuerpo que no es JSON → texto vacío (la ráfaga lo trata como no legible)", async () => {
  for (const respuesta of [() => Response.json({}), () => texto(123), () => texto(null), () => new Response("esto no es json", { status: 200 })]) {
    const { fetcher } = openaiDeAudio(respuesta);
    assertEquals((await transcribir(BYTES(), "audio/ogg", fetcher))?.texto, "");
  }
});

simulada("falla: el primer intento da 500 y el segundo sale bien → usa el segundo", async () => {
  const { fetcher, pedidos } = openaiDeAudio((n) => n === 1 ? Response.json({ error: { message: "caído (prueba)" } }, { status: 500 }) : texto("hola"));
  assertEquals((await transcribir(BYTES(), "audio/ogg", fetcher))?.texto, "hola");
  assertEquals(pedidos.length, 2);
});

simulada("falla: dos 500 o sin red → null, sin tirar (reintentó una vez)", async () => {
  for (
    const contestar of [
      () => Response.json({ error: { message: "caído (prueba)" } }, { status: 500 }),
      () => Response.json({ error: { message: "archivo inválido (prueba)" } }, { status: 400 }),
      (): Response => {
        throw new TypeError("error de red (prueba)");
      },
    ]
  ) {
    const { fetcher, pedidos } = openaiDeAudio(contestar);
    assertEquals(await transcribir(BYTES(), "audio/ogg", fetcher), null);
    assertEquals(pedidos.length, 2);
  }
});

simulada("sin OPENAI_API_KEY tira (error de programación, no de red) y no llama a nadie", async () => {
  const antes = Deno.env.get("OPENAI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  try {
    const { fetcher, pedidos } = openaiDeAudio(() => texto("hola"));
    await assertRejects(() => transcribir(BYTES(), "audio/ogg", fetcher), Error, "Falta OPENAI_API_KEY");
    assertEquals(pedidos.length, 0);
  } finally {
    if (antes !== undefined) Deno.env.set("OPENAI_API_KEY", antes);
  }
});

// ── 2. En la ráfaga y en el turno, con la base en memoria ───────────────────────────────────

const ACCESO: AccesoStorage = { base: "https://storage.prueba.local/adjuntos/", clave: "clave-de-prueba" };
const CLIENTE = "11111111-1111-4111-8111-111111111111";
const CHARLA = "22222222-2222-4222-8222-222222222222";
const NO_SOPORTADO = "Texto fijo de prueba: no pude escuchar el audio, ¿me lo escribís?";

function conAudio(db: BaseEnMemoria, p: { estado?: string; hace?: number } = {}): string {
  return db.agregarMensaje({
    direccion: "entrante", tipo: "audio", contenido: null,
    enviado_at: new Date(AHORA.getTime() - (p.hace ?? 1000)).toISOString(),
    adjunto_estado: p.estado ?? "listo", adjunto_path: `entrantes/${CHARLA}/audio.ogg`, adjunto_mime: "audio/ogg; codecs=opus",
    adjunto_segundos: 6, adjunto_voz: true,
  });
}

// El mismo fetcher atiende el bucket (GET del audio) y OpenAI (la transcripción), como en producción.
function storageY(transcripcion: (n: number) => Response, p: { bucketFalla?: boolean } = {}) {
  let alBucket = 0;
  let aOpenAI = 0;
  const fetcher = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.startsWith(ACCESO.base)) {
      alBucket++;
      return p.bucketFalla ? new Response("no está", { status: 404 }) : new Response(new Blob([BYTES()]));
    }
    if (u === URL_TRANSCRIPCIONES) return transcripcion(++aOpenAI);
    throw new Error(`la prueba no esperaba pedir ${u}`);
  }) as typeof fetch;
  return { fetcher, llamadas: () => ({ alBucket, aOpenAI }) };
}

simulada("ráfaga: un audio que se transcribe entra como texto etiquetado, queda guardado y cuenta su costo", async () => {
  const db = new BaseEnMemoria();
  const id = conAudio(db);
  const { fetcher } = storageY(() => texto("hola, quiero alquilar un traje para un casamiento"));
  const r = await agruparRafaga(db, CHARLA, AHORA, { acceso: ACCESO, fetcher });
  assertEquals(r.texto, etiquetaDeAudio("hola, quiero alquilar un traje para un casamiento"));
  assertEquals([r.soloNoTexto, r.hayAdjuntoNoLegible, r.hayAdjuntoPendiente], [false, false, false]);
  assertEquals(db.mensajes.find((m) => m.id === id)?.transcripcion, "hola, quiero alquilar un traje para un casamiento");
  assertEquals(r.llamadasLlm.length, 1);
  assertEquals(r.llamadasLlm[0].modelo, Deno.env.get("LLM_TRANSCRIPCION") ?? "");
  assertEquals(r.llamadasLlm[0].costoUsdDirecto, costoTranscripcionUsd(6));
});

for (const [nombre, transcripcion] of [
  ["OpenAI falla dos veces", () => Response.json({ error: { message: "caído (prueba)" } }, { status: 500 })],
  ["la transcripción sale vacía", () => texto("   ")],
] as [string, () => Response][]) {
  simulada(`ráfaga: si ${nombre}, el audio queda como no legible, sin tirar y sin guardar nada`, async () => {
    const db = new BaseEnMemoria();
    const id = conAudio(db);
    const { fetcher } = storageY(transcripcion);
    const r = await agruparRafaga(db, CHARLA, AHORA, { acceso: ACCESO, fetcher });
    assertEquals(r.texto, "");
    assertEquals([r.soloNoTexto, r.hayAdjuntoNoLegible], [true, true]);
    assertEquals(r.llamadasLlm, []);
    assertEquals(db.mensajes.find((m) => m.id === id)?.transcripcion, undefined);
  });
}

simulada("ráfaga: si el audio no está en el bucket, ni se llama al transcriptor", async () => {
  const db = new BaseEnMemoria();
  conAudio(db);
  const { fetcher, llamadas } = storageY(() => texto("no tendría que llegar acá"), { bucketFalla: true });
  const r = await agruparRafaga(db, CHARLA, AHORA, { acceso: ACCESO, fetcher });
  assertEquals([r.soloNoTexto, r.hayAdjuntoNoLegible], [true, true]);
  assertEquals(llamadas(), { alBucket: 1, aOpenAI: 0 });
});

simulada("ráfaga (caso parecido): audio que falla + un texto en la misma ráfaga → se contesta el texto", async () => {
  const db = new BaseEnMemoria();
  conAudio(db, { hace: 2000 });
  db.agregarMensaje({ direccion: "entrante", tipo: "texto", contenido: "te mandé un audio", enviado_at: new Date(AHORA.getTime() - 1000).toISOString() });
  const { fetcher } = storageY(() => Response.json({}, { status: 500 }));
  const r = await agruparRafaga(db, CHARLA, AHORA, { acceso: ACCESO, fetcher });
  assertEquals(r.texto, "te mandé un audio");
  assertEquals([r.soloNoTexto, r.hayAdjuntoNoLegible], [false, true]);
});

const turno = (db: BaseEnMemoria, fetcher: typeof fetch) =>
  correrTurno(db, {
    clienteId: CLIENTE, telefono: "+5490000000000", conversacionId: CHARLA, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, prompt: "Sos Lucía (prompt de prueba).", acceso: ACCESO, fetcher,
  });

simulada("turno: un audio que no se pudo transcribir → el texto fijo, sin gastar en Lucía ni en el fichero, y el turno no se cae", async () => {
  const db = new BaseEnMemoria();
  db.textos.texto_mensaje_no_soportado = NO_SOPORTADO;
  conAudio(db);
  const aModelos: string[] = [];
  const { fetcher: bucket } = storageY(() => Response.json({}, { status: 500 }));
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/v1/responses") || u.includes("/v1/chat/completions")) aModelos.push(u);
    return bucket(url, init);
  }) as typeof fetch;
  const r = await turno(db, fetcher);
  assertEquals(r.derivo, false);
  assertEquals(r.mensajesAlCliente, prepararParaEnviar([NO_SOPORTADO]));
  assertEquals(aModelos, [], "ni el principal ni el fichero tienen nada que leer");
  assert(db.eventos.some((e) => e.detalle.etapa === "no-es-texto"), JSON.stringify(db.eventos.map((e) => e.detalle)));
});

simulada("turno: un audio transcripto llega a Lucía y al fichero como palabras del cliente (un presupuesto dicho en audio se guarda)", async () => {
  const db = new BaseEnMemoria();
  conAudio(db);
  db.fragmentos["que-incluye"] = "El alquiler incluye el ambo, los ajustes de sastrería y la tintorería.";
  db.precios = [150000];
  const dicho = "hola, tengo hasta 120 mil para el traje del casamiento, cuánto sale?";
  const alPrincipal: PedidoSimulado[] = [];
  const alFichero: PedidoSimulado[] = [];
  const modelos = openaiSimulado((p) => {
    if (p.schema === "ficha") {
      alFichero.push(p);
      return { content: JSON.stringify({ ...FICHA_NULA, evento: "casamiento", presupuesto_mencionado: "hasta 120 mil" }) };
    }
    alPrincipal.push(p);
    return alPrincipal.length === 1
      ? { content: null, tool_calls: [llamar("consultar_catalogo", { modelo: null, accesorios: null })] }
      : { content: "El alquiler arranca a partir de $150.000 e incluye el ambo, los ajustes y la tintorería. ¿Para qué fecha es?" };
  });
  const { fetcher: bucket } = storageY(() => texto(dicho));
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) =>
    String(url).startsWith(ACCESO.base) || String(url) === URL_TRANSCRIPCIONES ? bucket(url, init) : modelos(url, init)) as typeof fetch;
  const r = await turno(db, fetcher);
  assertEquals(r.derivo, false);
  // Lucía lo lee etiquetado como transcripción…
  const ultimoDelCliente = [...alPrincipal[0].messages].reverse().find((m) => m.role === "user");
  assertEquals(ultimoDelCliente?.content, etiquetaDeAudio(dicho));
  // …el fichero también, y el presupuesto que el cliente dijo en el audio no se confunde con el de Lucía.
  assertStringIncludes(String(alFichero[0].messages[1].content), dicho);
  assertEquals(db.ficha.presupuesto_mencionado, "hasta 120 mil");
  assertEquals(db.ficha.evento, "casamiento");
});

// ── 3. Con el modelo de verdad (PRUEBA_MODELO_REAL=1) ───────────────────────────────────────
// Lista pero ignorada: en el repo no hay ningún audio de muestra (10/10) y los de clientes reales no
// se suben al repo. Para activarla: grabá una nota de voz corta de WhatsApp (5 a 10 segundos, sin datos
// de nadie; por ejemplo «Hola, quiero alquilar un traje para un casamiento el 12 de diciembre»),
// guardala como tests/subagentes/muestras/audio-corto.ogg y, si querés que además controle lo que
// entendió, escribí en muestras/audio-corto.txt las palabras que tienen que aparecer, una por línea.
// Cuesta ~US$ 0,006 por minuto de audio (precios.ts): un audio de 10 s, un décimo de centavo.

const MUESTRA = new URL("./muestras/audio-corto.ogg", import.meta.url);
const ESPERADO = new URL("./muestras/audio-corto.txt", import.meta.url);
const existe = (u: URL) => {
  try {
    return Deno.statSync(u).isFile;
  } catch {
    return false;
  }
};
const hayMuestra = existe(MUESTRA);
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

Deno.test({
  name: hayMuestra
    ? "transcriptor con el modelo real: el audio de muestra (PRUEBA_MODELO_REAL=1)"
    : "transcriptor con el modelo real: IGNORADA, falta tests/subagentes/muestras/audio-corto.ogg (ver el comentario de arriba)",
  ignore: !MODELO_REAL || !hayMuestra,
  async fn() {
    exigirClaveDeOpenAI();
    if (!Deno.env.get("LLM_TRANSCRIPCION")) {
      // El .env de este repo no trae los modelos (viven en los secretos de Supabase): el de producción
      // es gpt-4o-mini-transcribe (AGENTE.md § 11).
      Deno.env.set("LLM_TRANSCRIPCION", "gpt-4o-mini-transcribe");
      console.log("LLM_TRANSCRIPCION no estaba en el entorno: se usa gpt-4o-mini-transcribe (el de producción, AGENTE.md § 11)");
    }
    const bytes = new Uint8Array(await Deno.readFile(MUESTRA));
    const r = await transcribir(bytes, "audio/ogg; codecs=opus");
    assert(r, "OpenAI no devolvió la transcripción");
    assert(r.texto.length > 0, "la transcripción salió vacía");
    console.log(`transcriptor real (${Deno.env.get("LLM_TRANSCRIPCION")}): «${r.texto}» en ${r.ms} ms`);
    if (existe(ESPERADO)) {
      const palabras = (await Deno.readTextFile(ESPERADO)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const faltan = palabras.filter((p) => !sinTildes(r.texto).includes(sinTildes(p)));
      assertEquals(faltan, [], `no entendió: ${faltan.join(", ")}`);
    }
  },
});
