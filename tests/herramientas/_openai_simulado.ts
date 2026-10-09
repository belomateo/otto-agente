// OpenAI simulado para las pruebas del turno. Desde el 9/10 el principal va por la API de Responses
// (gpt-6.1-sol, llm/principal.ts) y el extractor sigue por Chat Completions: el mismo `fetcher` tiene
// que hablar los dos. La prueba ve siempre un pedido "estilo chat" (`messages`) y contesta
// { content, tool_calls }, como antes; acá se traduce la ida y la vuelta según la URL.

// deno-lint-ignore no-explicit-any
type Cualquiera = any;

export type LlamadaSimulada = { id: string; type: "function"; function: { name: string; arguments: string } };

export type PedidoSimulado = {
  // El cuerpo tal cual llegó (para mirar tool_choice, reasoning, etc.).
  body: Cualquiera;
  // Los mensajes en formato Chat Completions, vengan de `messages` o de `input` (Responses).
  messages: { role: string; content: Cualquiera; tool_calls?: LlamadaSimulada[]; tool_call_id?: string }[];
  // El json_schema que pidió (el extractor pide "ficha"); undefined en el principal.
  schema: string | undefined;
  // true si fue por /v1/responses.
  responses: boolean;
};

export type RespuestaSimulada = { content: string | null; tool_calls?: LlamadaSimulada[] };

export function openaiSimulado(responder: (p: PedidoSimulado) => RespuestaSimulada | Promise<RespuestaSimulada>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const direccion = url instanceof Request ? url.url : String(url);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const responses = direccion.includes("/v1/responses");
    const r = await responder({
      body,
      messages: responses ? aMensajes(body.input ?? []) : (body.messages ?? []),
      schema: body.response_format?.json_schema?.name,
      responses,
    });
    if (!responses) {
      return Response.json({
        choices: [{ message: { content: r.content, tool_calls: r.tool_calls } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } },
      });
    }
    const output = [
      ...(r.content ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: r.content }] }] : []),
      ...(r.tool_calls ?? []).map((t) => ({ type: "function_call", call_id: t.id, name: t.function.name, arguments: t.function.arguments })),
    ];
    return Response.json({ output, usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { cached_tokens: 0 } } });
  }) as typeof fetch;
}

// La ficha vacía que contesta el extractor cuando a la prueba no le importa.
export const FICHA_VACIA = JSON.stringify({
  nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null,
  color_preferido: null, presupuesto_mencionado: null,
});

// Una llamada a herramienta, lista para devolver.
export const llamar = (nombre: string, argumentos: unknown, id = "call_1"): LlamadaSimulada => ({
  id, type: "function", function: { name: nombre, arguments: JSON.stringify(argumentos) },
});

// De la entrada de Responses a mensajes estilo chat, para que la prueba los lea igual que antes.
function aMensajes(input: Cualquiera[]): PedidoSimulado["messages"] {
  return input.flatMap((i: Cualquiera) => {
    if (i.role === "developer") return [{ role: "system", content: i.content }];
    if (i.role === "user" || i.role === "assistant") {
      const content = Array.isArray(i.content)
        ? i.content.map((c: Cualquiera) => c.type === "input_image" ? { type: "image_url", image_url: { url: c.image_url } } : { type: "text", text: c.text })
        : i.content;
      return [{ role: i.role, content }];
    }
    if (i.type === "message") return [{ role: "assistant", content: (i.content ?? []).map((c: Cualquiera) => c.text).join("\n") }];
    if (i.type === "function_call") {
      return [{ role: "assistant", content: null, tool_calls: [{ id: i.call_id, type: "function", function: { name: i.name, arguments: i.arguments } }] }];
    }
    if (i.type === "function_call_output") return [{ role: "tool", tool_call_id: i.call_id, content: i.output }];
    return [];
  });
}

// Para las pruebas escritas antes del 9/10, con un fetcher que solo habla Chat Completions: los
// pedidos del principal (Responses) se le traducen a la forma de Chat, y su respuesta de vuelta.
export function comoChat(fetcherChat: typeof fetch): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const direccion = url instanceof Request ? url.url : String(url);
    if (!direccion.includes("/v1/responses")) return fetcherChat(url, init);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const cuerpoChat = {
      model: body.model,
      messages: aMensajes(body.input ?? []),
      tools: (body.tools ?? []).map((t: Cualquiera) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters, strict: t.strict } })),
      tool_choice: body.tool_choice,
    };
    const r = await fetcherChat("https://api.openai.com/v1/chat/completions", { ...init, body: JSON.stringify(cuerpoChat) });
    const j: Cualquiera = await r.json();
    const m = j?.choices?.[0]?.message ?? {};
    const output = [
      ...(m.content ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: m.content }] }] : []),
      ...(m.tool_calls ?? []).map((t: LlamadaSimulada) => ({ type: "function_call", call_id: t.id, name: t.function.name, arguments: t.function.arguments })),
    ];
    return Response.json({ output, usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { cached_tokens: 0 } } });
  }) as typeof fetch;
}
