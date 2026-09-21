// Cliente HTTP mínimo de OpenAI, para los cuatro usos de STACK.md § 3.
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
