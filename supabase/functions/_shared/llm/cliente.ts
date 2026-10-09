// Cliente HTTP mínimo de OpenAI, para los usos de STACK.md § 3.
//
// Dos caminos desde el 9/10:
//  · llamarRespuestas (/v1/responses) — el principal, que razona Y usa herramientas. Pedido de
//    Mateo (9/10): LLM_PRINCIPAL = gpt-6.1-sol, que en Chat Completions no acepta herramientas.
//    El motivo del 14/9 para no usar Responses (caché en 0%) ya no corre: el 8/10 cacheó el 99,9%
//    con prompt_cache_key (experimento en el scratchpad de esa sesión, ver memoria del proyecto).
//    store:false + include reasoning.encrypted_content: no queda nada guardado en OpenAI, y lo
//    que el modelo pensó entre una herramienta y la siguiente viaja de vuelta cifrado.
//  · llamarChat (/v1/chat/completions) — el extractor, y el principal solo si
//    LLM_API_PRINCIPAL=chat (volver atrás a gpt-5.6-luna sin razonamiento).
//
// Decisión del 14/9 (H1.7), verificada en vivo antes de escribir nada de esto — ver
// docs/hitos/1.7-emulador-y-guiones.md:
//  · Los cuatro modelos elegidos (LLM_PRINCIPAL=gpt-5.6-terra, LLM_CLASIFICADOR=gpt-5.6-luna,
//    LLM_EXTRACTOR=gpt-5.4-mini, LLM_ANALISTA=gpt-5.6-sol) van por Chat Completions
//    (/v1/chat/completions), NO por la API de Responses: para gpt-5.6, el caché de prefijo
//    está roto en Responses (0% de aciertos en la prueba, incluso con prompt_cache_key) y
//    funciona bien en Chat Completions (99%+ de aciertos en el segundo llamado).
//  · Con `tools`, gpt-5.6-terra exige `reasoning_effort: "none"` en Chat Completions o
//    devuelve 400 ("Function tools with reasoning_effort are not supported... use /v1/responses
//    or set reasoning_effort to 'none'"). Probado: con "none" las herramientas y el caché
//    andan los dos juntos.
//  · response_format json_schema con strict:true anduvo igual de bien en los cuatro modelos.
//
// Reintento: 1, con backoff (STACK.md § 3). Nunca tira: cada función de arriba (clasificador.ts,
// extractor.ts, principal.ts) decide qué hacer cuando esto devuelve null (derivar, saltear el
// paso, etc. — principio 8 de CLAUDE.md § 2, "quedarse sin respuesta no es un final válido").

const URL_CHAT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 20_000;
const ESPERA_ENTRE_REINTENTOS_MS = 800;

export type Uso = { tokensIn: number; tokensOut: number; tokensCacheados: number };

export type RespuestaChat = {
  contenido: string | null;
  llamadasHerramienta: { id: string; nombre: string; argumentos: string }[];
  uso: Uso;
  ms: number;
};

export type PeticionChat = {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: string;
  response_format?: unknown;
  reasoning_effort?: "none" | "minimal" | "low" | "medium" | "high";
  max_completion_tokens: number;
  temperature?: number;
};

// Exportada: transcripcion.ts (audio, multipart, no pasa por unaLlamada) también la necesita.
export function apiKey(): string {
  const k = Deno.env.get("OPENAI_API_KEY");
  if (!k) throw new Error("Falta OPENAI_API_KEY en el entorno.");
  return k;
}

async function unaLlamada(body: PeticionChat, fetcher: typeof fetch, clave: string): Promise<RespuestaChat> {
  const t0 = performance.now();
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetcher(URL_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controlador.signal,
    });
  } finally {
    clearTimeout(corte);
  }
  const ms = Math.round(performance.now() - t0);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`OpenAI ${body.model} respondió ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 500)}`);
  }
  const mensaje = j.choices?.[0]?.message ?? {};
  return {
    contenido: typeof mensaje.content === "string" ? mensaje.content : null,
    llamadasHerramienta: (mensaje.tool_calls ?? []).map((t: { id: string; function: { name: string; arguments: string } }) => ({
      id: t.id,
      nombre: t.function.name,
      argumentos: t.function.arguments,
    })),
    uso: {
      tokensIn: Number(j.usage?.prompt_tokens ?? 0),
      tokensOut: Number(j.usage?.completion_tokens ?? 0),
      tokensCacheados: Number(j.usage?.prompt_tokens_details?.cached_tokens ?? 0),
    },
    ms,
  };
}

// null = falló la llamada y ya reintentó una vez. Nunca lanza por un error de red/HTTP; sí lanza
// por un error de programación (OPENAI_API_KEY ausente) — eso no se recupera reintentando, y
// antes SÍ se lo comía este mismo try/catch (hallazgo de la auditoría, 17/9: la falta de la
// clave se veía en la bitácora igual que un problema de red, dos reintentos gastados de más
// incluidos). apiKey() corre ANTES del try: si falta, tira acá mismo, sin reintentar, y sube sin
// que nada la atrape hasta el nivel del worker — bien distinto de un `null` silencioso.
export async function llamarChat(body: PeticionChat, fetcher: typeof fetch = fetch): Promise<RespuestaChat | null> {
  const clave = apiKey();
  try {
    return await unaLlamada(body, fetcher, clave);
  } catch (primerError) {
    await new Promise((r) => setTimeout(r, ESPERA_ENTRE_REINTENTOS_MS));
    try {
      return await unaLlamada(body, fetcher, clave);
    } catch (segundoError) {
      console.error(`llamarChat(${body.model}): falló dos veces.`, primerError, segundoError);
      return null;
    }
  }
}

// ---------- Responses (/v1/responses) ----------

const URL_RESPUESTAS = "https://api.openai.com/v1/responses";
// Lo máximo que se le espera a UNA llamada del principal. Pensando, gpt-6.1-sol tarda bastante más
// que los 20 s de arriba; el turno entero tiene su propio tope (LIMITE_TURNO_MS en turno.ts) y
// cada llamada usa lo que quede de ese tope si es menos que esto.
export const TIMEOUT_RESPUESTAS_MS = 60_000;
// Con menos que esto por delante no vale la pena empezar una llamada: se cortaría a la mitad.
const MINIMO_PARA_LLAMAR_MS = 3_000;

export type PeticionRespuestas = {
  model: string;
  input: unknown[];
  tools?: unknown[];
  tool_choice?: "auto" | "none";
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
  include?: string[];
  store: false;
  prompt_cache_key?: string;
  max_output_tokens: number;
};

// `items`: la salida tal cual vino (razonamiento cifrado, llamadas a herramientas, mensaje). La
// siguiente llamada del mismo turno la manda de vuelta, así el modelo sigue con lo que ya pensó.
export type RespuestaRespuestas = RespuestaChat & { items: unknown[] };

// deno-lint-ignore no-explicit-any
type ItemSalida = any;

async function unaLlamadaRespuestas(body: PeticionRespuestas, fetcher: typeof fetch, clave: string, timeoutMs: number): Promise<RespuestaRespuestas> {
  const t0 = performance.now();
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), timeoutMs);
  let j: ItemSalida;
  let r: Response;
  try {
    r = await fetcher(URL_RESPUESTAS, {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controlador.signal,
    });
    j = await r.json().catch(() => ({}));
  } finally {
    clearTimeout(corte);
  }
  const ms = Math.round(performance.now() - t0);
  if (!r.ok) {
    throw new Error(`OpenAI responses ${body.model} respondió ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 500)}`);
  }
  // Solo en ensayos (scripts/repetir-charla.ts con LLM_TRAZA_USO=1): tokens y demora por llamada.
  if (Deno.env.get("LLM_TRAZA_USO") === "1") {
    console.error(
      `USO ${body.model} responses in=${j.usage?.input_tokens ?? 0} cache=${j.usage?.input_tokens_details?.cached_tokens ?? 0} ` +
        `out=${j.usage?.output_tokens ?? 0} razon=${j.usage?.output_tokens_details?.reasoning_tokens ?? 0} ms=${ms}`,
    );
  }
  const salida: ItemSalida[] = Array.isArray(j.output) ? j.output : [];
  const texto = salida
    .filter((o) => o?.type === "message")
    .flatMap((o) => (Array.isArray(o.content) ? o.content : []).filter((c: ItemSalida) => c?.type === "output_text").map((c: ItemSalida) => String(c.text ?? "")))
    .join("\n")
    .trim();
  return {
    contenido: texto || null,
    llamadasHerramienta: salida
      .filter((o) => o?.type === "function_call")
      .map((o) => ({ id: String(o.call_id), nombre: String(o.name), argumentos: String(o.arguments ?? "") })),
    uso: {
      tokensIn: Number(j.usage?.input_tokens ?? 0),
      // Incluye los tokens de razonamiento: OpenAI los cobra como salida.
      tokensOut: Number(j.usage?.output_tokens ?? 0),
      tokensCacheados: Number(j.usage?.input_tokens_details?.cached_tokens ?? 0),
    },
    ms,
    items: salida,
  };
}

// Igual que llamarChat (null = falló y ya reintentó; tira solo si falta la clave), con una
// diferencia: no se pasa de `hastaMs`. Cada intento usa lo que quede hasta ahí, con el tope de
// TIMEOUT_RESPUESTAS_MS; si no queda tiempo para un intento útil, devuelve null sin llamar.
export async function llamarRespuestas(
  body: PeticionRespuestas,
  opciones: { hastaMs: number; fetcher?: typeof fetch; timeoutMs?: number },
): Promise<RespuestaRespuestas | null> {
  const clave = apiKey();
  const fetcher = opciones.fetcher ?? fetch;
  const tope = opciones.timeoutMs ?? TIMEOUT_RESPUESTAS_MS;
  let primerError: unknown = null;
  for (let intento = 1; intento <= 2; intento++) {
    const queda = Math.min(tope, opciones.hastaMs - Date.now());
    if (queda < MINIMO_PARA_LLAMAR_MS) break;
    try {
      return await unaLlamadaRespuestas(body, fetcher, clave, queda);
    } catch (e) {
      if (intento === 1) {
        primerError = e;
        await new Promise((r) => setTimeout(r, ESPERA_ENTRE_REINTENTOS_MS));
      } else {
        console.error(`llamarRespuestas(${body.model}): falló dos veces.`, primerError, e);
      }
    }
  }
  if (primerError) console.error(`llamarRespuestas(${body.model}): sin respuesta.`, primerError);
  return null;
}
