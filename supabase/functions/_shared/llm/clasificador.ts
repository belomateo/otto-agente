// LLM_CLASIFICADOR (gpt-5.6-luna): intención de entrada, sobre el mensaje de este turno y las
// últimas líneas del historial (AGENTE.md § 11: "Mensaje + últimas 3 líneas → JSON"). Corre
// SOLO cuando la derivación dura por palabra clave (derivacion_dura.ts) no encontró nada: el
// código ya cubrió lo determinístico, esto es la red para la intención de derivar cuando no hay
// palabra clave (CLAUDE.md § 2). Nunca decide un hecho por sí solo: motivo_derivacion todavía
// pasa por el enum del schema, y quien deriva de verdad es el código del turno, no esta función.

import { llamarChat } from "./cliente.ts";
import { type Clasificacion, ESQUEMA_CLASIFICACION } from "./esquemas.ts";

export type ResultadoClasificador = { clasificacion: Clasificacion; tokensIn: number; tokensOut: number; tokensCacheados: number; ms: number };

const INSTRUCCION =
  "Clasificá el último mensaje del cliente de una casa de alquiler de trajes, con el contexto de las últimas líneas. " +
  "intencion: de qué habla. urgencia: qué tan apurado suena. derivar_duro: true solo si hay un reclamo, una prenda " +
  "dañada o manchada, o un pedido corporativo/de uniformes que las palabras clave no hayan agarrado (parafraseado, " +
  "con errores, sin la palabra exacta). Si derivar_duro es true, motivo_derivacion dice cuál de esas tres es; si es " +
  "false, motivo_derivacion es null. Ante la duda de si es o no una de esas tres categorías, false.";

export async function clasificar(
  ultimasLineas: string,
  fetcher?: typeof fetch,
): Promise<ResultadoClasificador | null> {
  const r = await llamarChat(
    {
      model: Deno.env.get("LLM_CLASIFICADOR") ?? "",
      messages: [
        { role: "system", content: INSTRUCCION },
        { role: "user", content: ultimasLineas },
      ],
      response_format: { type: "json_schema", json_schema: { name: "clasificacion", schema: ESQUEMA_CLASIFICACION, strict: true } },
      max_completion_tokens: 200,
    },
    fetcher,
  );
  if (!r || !r.contenido) return null;
  try {
    return { clasificacion: JSON.parse(r.contenido), tokensIn: r.uso.tokensIn, tokensOut: r.uso.tokensOut, tokensCacheados: r.uso.tokensCacheados, ms: r.ms };
  } catch (e) {
    console.error("clasificar: la respuesta no fue JSON válido", r.contenido, e);
    return null;
  }
}
