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

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";

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

// Pedido de Mateo (21/10): todo pasa a Claude. Un LLM_* que empieza con "claude-" va a Anthropic
// (llamarClaude, abajo) desde llamarChat y llamarRespuestas, sin tocar a quien llama.
export const esClaude = (modelo: string | undefined) => (modelo ?? "").startsWith("claude-");

// Exportada: transcripcion.ts (audio, multipart, no pasa por unaLlamada) también la necesita, y las
// funciones (analista, corrector, subida-turnos) la piden antes de empezar con el modelo que van a usar.
export function apiKey(modelo = ""): string {
  const nombre = esClaude(modelo) ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const k = Deno.env.get(nombre);
  if (!k) throw new Error(`Falta ${nombre} en el entorno.`);
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
  if (esClaude(body.model)) {
    const formato = body.response_format as { json_schema?: { schema?: unknown } } | undefined;
    return llamarClaude({
      model: body.model,
      mensajes: body.messages,
      herramientas: (body.tools as { function: HerramientaClaude }[] | undefined)?.map((t) => t.function),
      tool_choice: body.tool_choice === "none" ? "none" : "auto",
      esfuerzo: !body.reasoning_effort || body.reasoning_effort === "none" ? null : body.reasoning_effort,
      esquema: formato?.json_schema?.schema,
      max_tokens: body.max_completion_tokens,
    }, { hastaMs: Date.now() + 2 * TIMEOUT_MS, fetcher, timeoutMs: TIMEOUT_MS });
  }
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
  // Salida en JSON estricto contra un esquema. La usa el analista de charlas (0102, 10/10), que no
  // tiene herramientas y tiene que devolver una lista que el código valida; el principal no la manda.
  text?: { format: { type: "json_schema"; name: string; schema: unknown; strict: boolean } };
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
  if (esClaude(body.model)) {
    // Solo la usan así el analista y el corrector: mensajes developer/user sueltos, sin herramientas
    // (el principal va directo a llamarClaude, con sus mensajes en formato Chat).
    return llamarClaude({
      model: body.model,
      mensajes: body.input.map((m) => {
        const x = m as { role?: string; content?: unknown };
        return { role: x.role === "developer" ? "system" : x.role, content: x.content };
      }),
      tool_choice: body.tool_choice,
      esfuerzo: body.reasoning?.effort ?? null,
      esquema: body.text?.format.schema,
      max_tokens: body.max_output_tokens,
    }, opciones);
  }
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

// ---------- Claude (/v1/messages de Anthropic, desde el 21/10) ----------

// La forma de herramienta que comparten Chat (adentro de `function`) y Responses.
export type HerramientaClaude = { name: string; description?: string; parameters: unknown; strict?: boolean };

export type PeticionClaude = {
  model: string;
  // En formato Chat (MensajeLlm de principal.ts). Un assistant con `items` trae los bloques tal cual
  // los devolvió Claude, razonamiento incluido, y vuelven así en la llamada siguiente del turno.
  mensajes: unknown[];
  herramientas?: HerramientaClaude[];
  tool_choice?: "auto" | "none";
  esfuerzo: "minimal" | "low" | "medium" | "high" | null; // null = sin razonar (el extractor y compañía)
  esquema?: unknown; // salida en JSON estricto contra este esquema
  max_tokens: number;
};

type Bloque = Record<string, unknown>;
type MensajeClaude = { role: "user" | "assistant"; content: Bloque[] };

// Claude no las acepta en un esquema de salida estricto.
const RESTRICCIONES_NO_SOPORTADAS = new Set(["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "multipleOf"]);

export function sinRestricciones(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sinRestricciones);
  if (!x || typeof x !== "object") return x;
  // `type: ["string", "null"]` junto a un enum Claude lo rechaza (400 del 21/10); el enum ya dice qué vale.
  const tipoDeMas = "enum" in x && Array.isArray((x as { type?: unknown }).type);
  return Object.fromEntries(
    Object.entries(x)
      .filter(([k]) => !RESTRICCIONES_NO_SOPORTADAS.has(k) && !(tipoDeMas && k === "type"))
      .map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([n, s]) => [n, sinRestricciones(s)])) : sinRestricciones(v)]),
  );
}

// La marca de las correcciones internas (abajo). Si el cliente la escribe, se le borra: si no, podría
// darle órdenes a Lucía haciéndose pasar por el sistema (revisión de seguridad, 21/10).
const MARCA_INTERNA = "[Instrucción interna, no la escribió el cliente]";
// NFKC junta una «ó» escrita en dos partes y pasa los corchetes anchos a comunes; los invisibles se sacan.
const sinMarca = (t: string) =>
  t.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "").replace(/\[\s*instrucci[oó]n\s+interna[^\]]*\]/gi, "");

function parteDelCliente(c: { type: string; text?: string; image_url?: { url: string } }): Bloque {
  if (c.type !== "image_url") return { type: "text", text: sinMarca(c.text ?? "") };
  const url = c.image_url?.url ?? "";
  const datos = url.match(/^data:([^;,]+);base64,(.*)$/s);
  return { type: "image", source: datos ? { type: "base64", media_type: datos[1], data: datos[2] } : { type: "url", url } };
}

// Los system del principio van a `system` (el primero, el prompt, cacheado). Uno que llega a mitad de
// charla (rehacer, último intento) va del lado del cliente, marcado: cambiar `system` a mitad de turno
// cambiaría el comienzo cacheado y Claude descartaría el razonamiento que viaja de vuelta. Mensajes
// seguidos del mismo lado se juntan, y la charla arranca del lado del cliente, como pide Claude.
export function mensajesClaude(mensajes: unknown[]): { system: Bloque[]; messages: MensajeClaude[] } {
  const system: Bloque[] = [];
  const messages: MensajeClaude[] = [];
  const agregar = (role: MensajeClaude["role"], bloques: Bloque[]) => {
    const llenos = bloques.filter((b) => b.type !== "text" || String(b.text ?? "").trim() !== "");
    if (!llenos.length) return;
    const ultimo = messages.at(-1);
    if (ultimo?.role === role) ultimo.content.push(...llenos);
    else messages.push({ role, content: llenos });
  };
  for (const crudo of mensajes) {
    const m = crudo as {
      role: string;
      content: unknown;
      items?: Bloque[];
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      tool_call_id?: string;
    };
    if (m.role === "system") {
      if (messages.length === 0) system.push({ type: "text", text: String(m.content) });
      else agregar("user", [{ type: "text", text: `${MARCA_INTERNA} ${m.content}` }]);
    } else if (m.role === "tool") {
      agregar("user", [{ type: "tool_result", tool_use_id: m.tool_call_id, content: String(m.content) }]);
    } else if (m.role === "user") {
      agregar("user", typeof m.content === "string" ? [{ type: "text", text: sinMarca(m.content) }] : (m.content as { type: string }[]).map(parteDelCliente));
    } else if (m.role === "assistant") {
      agregar("assistant", m.items?.length ? m.items : [
        { type: "text", text: String(m.content ?? "") },
        ...(m.tool_calls ?? []).map((t) => ({ type: "tool_use", id: t.id, name: t.function.name, input: JSON.parse(t.function.arguments || "{}") })),
      ]);
    }
  }
  if (messages[0]?.role === "assistant") messages.unshift({ role: "user", content: [{ type: "text", text: "(empieza la charla)" }] });
  return { system, messages };
}

// Solo para Claude, con herramientas (pedido de Mateo, 21/10: «ajustá la estructura para Anthropic»). En
// Sonnet 5.5 lo que escribe antes de una herramienta vuelve como nota de progreso vacía y no le llega al
// cliente; y en el ensayo prometió «te guardo los dos horarios», agendó «10:15» sin preguntar cuál de dos
// días y buscó un turno doble para una madre que acompañaba a su hijo. Va aparte del prompt.md para que
// volver a OpenAI no cambie nada.
export const NOTA_CLAUDE_HERRAMIENTAS =
  "Lo que escribas antes de usar una herramienta no le llega al cliente: usá primero las herramientas que necesites y escribí la respuesta completa al final. " +
  "Un horario solo queda reservado cuando lo agendás con agendar_turno: antes de eso no le digas que se lo guardás ni que se lo separás. " +
  "Si ofreciste la misma hora en dos días y el cliente contesta solo la hora, preguntale qué día prefiere antes de agendar. " +
  "El tipo de turno es el de quien se viste (graduado, novio o invitado), aunque venga acompañado o se prueben dos: nunca doble. " +
  "Usá el mismo tipo en todas las búsquedas de la charla.";

export function cuerpoClaude(p: PeticionClaude) {
  const { system, messages } = mensajesClaude(p.mensajes);
  // El comienzo fijo (el prompt y, con herramientas, la nota) se cachea; lo que sigue cambia en cada turno.
  let fijo = 0;
  if (p.herramientas?.length) {
    fijo = Math.min(1, system.length);
    system.splice(fijo, 0, { type: "text", text: NOTA_CLAUDE_HERRAMIENTAS });
  }
  if (system.length) system[fijo].cache_control = { type: "ephemeral" };
  const haiku = p.model.includes("haiku");
  const esfuerzo = p.esfuerzo === "minimal" ? "low" : p.esfuerzo;
  // Sin razonar: Haiku lo apaga con "disabled" y Sonnet 5.5 con "between_tools"; Opus 5.5 no se puede
  // apagar, piensa lo mínimo con effort "low". Razonando, el modo adaptativo es el de fábrica.
  const thinking = esfuerzo ? null : haiku ? { type: "disabled" } : p.model.includes("sonnet") ? { type: "between_tools" } : null;
  const effort = esfuerzo ?? (thinking ? null : "low");
  return {
    model: p.model,
    max_tokens: p.max_tokens,
    ...(system.length ? { system } : {}),
    messages,
    cache_control: { type: "ephemeral" }, // además del prompt, lo que se va sumando adentro del turno
    ...(p.herramientas?.length
      ? {
        // Sin strict: Claude lo limita a 16 campos opcionales entre todas las herramientas y las de Lucía
        // tienen 19 (400 del 21/10). Los argumentos los valida igual validar.ts antes de ejecutar, y un
        // rechazo vuelve al modelo para que corrija.
        tools: p.herramientas.map((h) => ({ name: h.name, description: h.description, input_schema: h.parameters })),
        tool_choice: { type: p.tool_choice ?? "auto" },
      }
      : {}),
    ...(thinking ? { thinking } : {}),
    ...(effort || p.esquema
      ? { output_config: { ...(effort ? { effort } : {}), ...(p.esquema ? { format: { type: "json_schema", schema: sinRestricciones(p.esquema) } } : {}) } }
      : {}),
    // Si un filtro de seguridad de Claude frena el pedido, lo contesta otro modelo de Anthropic en la
    // misma llamada. Haiku no tiene ese respaldo.
    ...(haiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
  };
}

// Mismo contrato que llamarRespuestas: null = falló (y ya reintentó) o no contestó; tira solo si
// falta ANTHROPIC_API_KEY; no se pasa de `hastaMs`.
export async function llamarClaude(
  p: PeticionClaude,
  opciones: { hastaMs: number; fetcher?: typeof fetch; timeoutMs?: number },
): Promise<RespuestaRespuestas | null> {
  const cliente = new Anthropic({ apiKey: apiKey(p.model), maxRetries: 0, ...(opciones.fetcher ? { fetch: opciones.fetcher } : {}) });
  const cuerpo = cuerpoClaude(p) as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
  const tope = opciones.timeoutMs ?? TIMEOUT_RESPUESTAS_MS;
  let primerError: unknown = null;
  for (let intento = 1; intento <= 2; intento++) {
    const queda = Math.min(tope, opciones.hastaMs - Date.now());
    if (queda < MINIMO_PARA_LLAMAR_MS) break;
    try {
      const t0 = performance.now();
      const r = await cliente.beta.messages.create(cuerpo, { timeout: queda });
      const ms = Math.round(performance.now() - t0);
      const u = r.usage;
      if (Deno.env.get("LLM_TRAZA_USO") === "1") {
        console.error(`USO ${r.model} claude in=${u.input_tokens} cache=${u.cache_read_input_tokens ?? 0} escrito=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} fin=${r.stop_reason} ms=${ms}`);
      }
      // Un rechazo (aun después del respaldo) o una respuesta cortada a la mitad no se reintentan:
      // saldrían igual. Quien llama sigue como con cualquier null (último intento, saltear el paso).
      if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") {
        console.error(`llamarClaude(${p.model}): terminó con ${r.stop_reason}.`);
        return null;
      }
      const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      return {
        contenido: texto || null,
        llamadasHerramienta: r.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, nombre: b.name, argumentos: JSON.stringify(b.input) }] : [])),
        uso: {
          // Como OpenAI: la entrada incluye lo cacheado. Lo escrito en caché (1,25×) se estima a precio normal.
          tokensIn: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          tokensOut: u.output_tokens,
          tokensCacheados: u.cache_read_input_tokens ?? 0,
        },
        ms,
        items: r.content,
      };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.BadRequestError) {
        // Clave mala o pedido mal armado: reintentar da lo mismo.
        console.error(`llamarClaude(${p.model}): ${e.status}.`, e.message);
        return null;
      }
      if (intento === 1) {
        primerError = e;
        await new Promise((res) => setTimeout(res, ESPERA_ENTRE_REINTENTOS_MS));
      } else {
        console.error(`llamarClaude(${p.model}): falló dos veces.`, primerError, e);
      }
    }
  }
  if (primerError) console.error(`llamarClaude(${p.model}): sin respuesta.`, primerError);
  return null;
}
