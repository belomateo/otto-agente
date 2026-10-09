// LLM_PRINCIPAL: la respuesta de Lucía, con herramientas (AGENTE.md § 3 paso 6, STACK.md § 3 y
// § 8), hasta 6 iteraciones de tool calling.
//
// Desde el 9/10 (pedido de Mateo) va por la API de Responses con razonamiento
// (LLM_RAZONAMIENTO, "low" si no se dice otra cosa): gpt-6.1-sol piensa antes de contestar y en
// Chat Completions no acepta herramientas. LLM_API_PRINCIPAL=chat vuelve al camino anterior (Chat
// Completions con reasoning_effort "none", el de gpt-5.6-luna) por si hay que dar marcha atrás.
//
// Cómo termina un turno acá adentro:
//  · el modelo responde sin tool_calls → esa es la respuesta final;
//  · una herramienta devuelve efectos.cortaTurno (derivar_a_persona, o una derivación dura que
//    devolvió una herramienta de consulta como buscar_horarios) → se corta ahí mismo, sin
//    pedirle más texto al modelo: lo que sale al cliente son los efectos.mensajesAlCliente que
//    juntaron las herramientas de este turno, en el orden en que se llamaron;
//  · se acaban las iteraciones o el tiempo → sin respuesta final; el llamador (turno.ts) le pide
//    entonces una respuesta sin herramientas con contestarSinHerramientas.
// Los `efectos` de cada herramienta (mensajes armados en código, fotos, aviso al equipo) nunca
// se le mandan de vuelta al modelo: son para el cliente real, los junta el orquestador
// (turno.ts). Al modelo solo le vuelve `datos` (o el rechazo), que es lo que tiene que leer para
// seguir.

import type { Efectos } from "../herramientas/tipos.ts";
import { ejecutarHerramienta } from "../herramientas/index.ts";
import type { ContextoHerramienta } from "../herramientas/tipos.ts";
import type { DefinicionParaModelo } from "../herramientas/index.ts";
import { llamarChat, llamarRespuestas, type PeticionRespuestas, type Uso } from "./cliente.ts";

// Bloque de contenido de un mensaje "user" con imágenes (pedido de Mateo, 19/9: que Lucía vea
// fotos). Se arma en formato de Chat Completions (un array de bloques en vez de un string; la url
// puede ser un data: URI, así se manda hoy, ver rafaga.ts) y entradaRespuestas lo traduce.
export type ContenidoLlm = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

// `items` (solo con Responses): la salida cruda de esa llamada, con el razonamiento cifrado. Se
// manda de vuelta tal cual en la llamada siguiente del mismo turno.
export type MensajeLlm =
  | { role: "system" | "user" | "assistant"; content: string; items?: unknown[] }
  | { role: "user"; content: ContenidoLlm[] }
  | {
    role: "assistant";
    content: string | null;
    tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    items?: unknown[];
  }
  | { role: "tool"; tool_call_id: string; content: string };

// costoUsdDirecto (pedido de Mateo, 19/9: leer audios): la transcripción se factura por minuto,
// no por token, así que Uso (pensada para chat completions) no le queda — en vez de forzarla a
// esa forma, este override reemplaza el cálculo de costoUsd() en bitacora.ts. tokensIn/tokensOut
// quedan en 0 para esas filas: no aplican, pero consumo_llm los pide igual.
export type LlamadaLlm = { modelo: string; uso: Uso; ms: number; costoUsdDirecto?: number };

export type ResultadoPrincipal = {
  textoFinal: string | null;
  efectos: Efectos[]; // uno por cada herramienta que devolvió efectos, en orden de ejecución
  mensajes: MensajeLlm[]; // el historial completo con lo que se agregó, por si hace falta "rehacer"
  llamadasLlm: LlamadaLlm[];
  iteracionesUsadas: number;
  seCortoPorTiempo: boolean;
  agotoIteraciones: boolean;
};

const MAXIMO_ITERACIONES = 6;
// Cupo de salida por llamada con Responses: el razonamiento sale de este mismo cupo. La respuesta
// en sí es corta (WhatsApp); lo demás es margen para pensar.
const MAXIMO_SALIDA_RESPUESTAS = 4_000;
// Con el mismo comienzo (herramientas + prompt) en todas las llamadas, OpenAI reusa el caché.
const CLAVE_CACHE = "otto-lucia-principal";

type Razonamiento = NonNullable<PeticionRespuestas["reasoning"]>["effort"];
const RAZONAMIENTOS: readonly Razonamiento[] = ["minimal", "low", "medium", "high"];

function usaChat(): boolean {
  return (Deno.env.get("LLM_API_PRINCIPAL") ?? "").trim().toLowerCase() === "chat";
}

function razonamiento(): Razonamiento {
  const r = (Deno.env.get("LLM_RAZONAMIENTO") ?? "").trim().toLowerCase() as Razonamiento;
  return RAZONAMIENTOS.includes(r) ? r : "low";
}

function comoHerramientaChat(d: DefinicionParaModelo) {
  return { type: "function", function: { name: d.name, description: d.description, parameters: d.parameters, strict: d.strict } };
}

// De los mensajes del turno (formato Chat Completions, el que arma turno.ts) a la entrada de
// Responses. Los "system" van como "developer": el prompt primero y el contexto del turno después,
// igual que antes, así el comienzo de cada llamada es siempre el mismo y se cachea.
export function entradaRespuestas(mensajes: MensajeLlm[]): unknown[] {
  const entrada: unknown[] = [];
  for (const m of mensajes) {
    if (m.role === "system") {
      entrada.push({ role: "developer", content: m.content });
    } else if (m.role === "user") {
      entrada.push(
        typeof m.content === "string" ? { role: "user", content: m.content } : {
          role: "user",
          content: m.content.map((c) => c.type === "text" ? { type: "input_text", text: c.text } : { type: "input_image", image_url: c.image_url.url }),
        },
      );
    } else if (m.role === "assistant") {
      if (m.items?.length) {
        entrada.push(...m.items);
        continue;
      }
      if (m.content) entrada.push({ role: "assistant", content: m.content });
      if ("tool_calls" in m) {
        for (const t of m.tool_calls) entrada.push({ type: "function_call", call_id: t.id, name: t.function.name, arguments: t.function.arguments });
      }
    } else if ("tool_call_id" in m) {
      entrada.push({ type: "function_call_output", call_id: m.tool_call_id, output: m.content });
    }
  }
  return entrada;
}

function peticionRespuestas(modelo: string, mensajes: MensajeLlm[], herramientas: DefinicionParaModelo[], toolChoice: "auto" | "none"): PeticionRespuestas {
  return {
    model: modelo,
    input: entradaRespuestas(mensajes),
    // Ya vienen en el formato de Responses (herramientas/index.ts).
    tools: herramientas,
    tool_choice: toolChoice,
    reasoning: { effort: razonamiento() },
    include: ["reasoning.encrypted_content"],
    store: false,
    prompt_cache_key: CLAVE_CACHE,
    max_output_tokens: MAXIMO_SALIDA_RESPUESTAS,
  };
}

export async function correrPrincipal(p: {
  mensajes: MensajeLlm[];
  herramientas: DefinicionParaModelo[];
  ctxHerramientas: ContextoHerramienta;
  limiteMs: number; // Date.now() a partir del cual hay que cortar
  iteracionesYaUsadas?: number;
  fetcher?: typeof fetch;
}): Promise<ResultadoPrincipal> {
  const mensajes = [...p.mensajes];
  const chat = usaChat();
  const toolsChat = p.herramientas.map(comoHerramientaChat);
  const llamadasLlm: LlamadaLlm[] = [];
  const efectos: Efectos[] = [];
  let textoFinal: string | null = null;
  let iteracion = p.iteracionesYaUsadas ?? 0;
  const modelo = Deno.env.get("LLM_PRINCIPAL") ?? "";

  while (iteracion < MAXIMO_ITERACIONES) {
    if (Date.now() >= p.limiteMs) {
      return { textoFinal: null, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: true, agotoIteraciones: false };
    }
    iteracion++;
    const r = chat
      ? await llamarChat(
        { model: modelo, messages: mensajes, tools: toolsChat, tool_choice: "auto", reasoning_effort: "none", max_completion_tokens: 700 },
        p.fetcher,
      )
      : await llamarRespuestas(peticionRespuestas(modelo, mensajes, p.herramientas, "auto"), { hastaMs: p.limiteMs, fetcher: p.fetcher });
    if (!r) {
      // Sin respuesta y ya sin tiempo: es un corte por tiempo, no un error del modelo.
      const sinTiempo = Date.now() >= p.limiteMs - 3_000;
      return { textoFinal: null, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: sinTiempo, agotoIteraciones: false };
    }
    llamadasLlm.push({ modelo, uso: r.uso, ms: r.ms });
    if (r.contenido) textoFinal = r.contenido;
    const items = "items" in r ? (r.items as unknown[]) : undefined;

    if (r.llamadasHerramienta.length === 0) {
      mensajes.push({ role: "assistant", content: r.contenido ?? "", ...(items ? { items } : {}) });
      return { textoFinal, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: false };
    }

    mensajes.push({
      role: "assistant",
      content: r.contenido,
      tool_calls: r.llamadasHerramienta.map((t) => ({ id: t.id, type: "function", function: { name: t.nombre, arguments: t.argumentos } })),
      ...(items ? { items } : {}),
    });

    let cortoElTurno = false;
    for (const llamada of r.llamadasHerramienta) {
      const resultado = await ejecutarHerramienta(llamada.nombre, llamada.argumentos, p.ctxHerramientas);
      mensajes.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: JSON.stringify(resultado.ok ? resultado.datos : { error: resultado.rechazo, mensaje: resultado.mensaje }),
      });
      if (resultado.ok && resultado.efectos) {
        efectos.push(resultado.efectos);
        if (resultado.efectos.cortaTurno) cortoElTurno = true;
      }
    }
    if (cortoElTurno) {
      return { textoFinal, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: false };
    }
  }
  return { textoFinal: null, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: true };
}

// Último intento (pedido de Mateo, 9/10: «que Lucía siempre conteste por más que tarde»): cuando
// correrPrincipal se quedó sin tiempo o sin respuesta, una llamada más, SIN herramientas, con todo
// lo que ya se consultó en el turno y una instrucción para contestar ya con eso. Las herramientas
// se mandan igual (con tool_choice "none") porque los mensajes pueden traer llamadas a ellas.
export async function contestarSinHerramientas(p: {
  mensajes: MensajeLlm[];
  instruccion: string;
  herramientas: DefinicionParaModelo[];
  hastaMs: number;
  fetcher?: typeof fetch;
}): Promise<{ texto: string | null; llamada: LlamadaLlm | null }> {
  const modelo = Deno.env.get("LLM_PRINCIPAL") ?? "";
  const mensajes: MensajeLlm[] = [...p.mensajes, { role: "system", content: p.instruccion }];
  const r = usaChat()
    ? await llamarChat(
      { model: modelo, messages: mensajes, tools: p.herramientas.map(comoHerramientaChat), tool_choice: "none", reasoning_effort: "none", max_completion_tokens: 700 },
      p.fetcher,
    )
    : await llamarRespuestas(peticionRespuestas(modelo, mensajes, p.herramientas, "none"), { hastaMs: p.hastaMs, fetcher: p.fetcher });
  if (!r) return { texto: null, llamada: null };
  return { texto: r.contenido?.trim() || null, llamada: { modelo, uso: r.uso, ms: r.ms } };
}
