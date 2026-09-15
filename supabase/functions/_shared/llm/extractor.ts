// LLM_EXTRACTOR (gpt-5.4-mini): arma la ficha del cliente a partir del turno completo (AGENTE.md
// § 3 paso 10 y § 7). Solo escribe lo que el cliente dijo; nunca infiere.
//
// El modelo puede volver con basura en un campo (una fecha a medias como "noviembre" en vez de
// AAAA-MM-DD: pasó en la prueba en vivo del 14/9). Por eso `validarExtraccion` vuelve a chequear
// cada campo contra su propio enum o formato ANTES de que nada llegue a actualizarFicha: un
// campo inválido se descarta y se avisa, nunca se escribe (principio 6, CLAUDE.md § 2 — acá
// tampoco el LLM decide un hecho: si no pasa la validación, no es un hecho, es ruido).

import { DIA_O_NOCHE, EVENTOS, ROLES_CLIENTE } from "../enums.ts";
import { CAMPOS_FICHA, type Ficha } from "../herramientas/ficha.ts";
import { esFechaValida } from "../tiempo.ts";
import { llamarChat } from "./cliente.ts";
import { ESQUEMA_FICHA } from "./esquemas.ts";

export type ResultadoExtractor = { ficha: Partial<Ficha>; descartados: string[]; tokensIn: number; tokensOut: number; tokensCacheados: number; ms: number };

const INSTRUCCION =
  "Leé la charla completa (cliente y Lucía) de una casa de alquiler de trajes y completá la ficha con lo que el " +
  "cliente dijo de sí mismo, en cualquier mensaje de toda la charla, no solo el último. Nunca lo que Lucía " +
  "ofreció ni lo que vos supongas: si no lo dijo, ese campo va null. Si un dato quedó claro antes y ningún " +
  "mensaje posterior lo contradice, seguí completándolo igual (no lo dejes null solo porque el último mensaje " +
  "no lo repite). Ante la duda entre dos categorías posibles para el mismo campo, preferí null a adivinar. " +
  "fecha_evento solo si se puede saber el día exacto (AAAA-MM-DD); \"en noviembre\" o \"el mes que viene\" sin día " +
  "puntual es null, no un mes suelto.";

function limpioOnull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export function validarExtraccion(cruda: Record<string, unknown>): { ficha: Partial<Ficha>; descartados: string[] } {
  const ficha: Partial<Ficha> = {};
  const descartados: string[] = [];
  for (const campo of CAMPOS_FICHA) {
    const valor = limpioOnull(cruda[campo]);
    if (valor === null) continue;
    if (campo === "evento" && !(EVENTOS as readonly string[]).includes(valor)) { descartados.push(`evento="${valor}"`); continue; }
    if (campo === "rol" && !(ROLES_CLIENTE as readonly string[]).includes(valor)) { descartados.push(`rol="${valor}"`); continue; }
    if (campo === "dia_o_noche" && !(DIA_O_NOCHE as readonly string[]).includes(valor)) { descartados.push(`dia_o_noche="${valor}"`); continue; }
    if (campo === "fecha_evento" && !esFechaValida(valor)) { descartados.push(`fecha_evento="${valor}" (no es AAAA-MM-DD)`); continue; }
    ficha[campo] = valor;
  }
  return { ficha, descartados };
}

export async function extraer(turnoCompletoTexto: string, fetcher?: typeof fetch): Promise<ResultadoExtractor | null> {
  const r = await llamarChat(
    {
      model: Deno.env.get("LLM_EXTRACTOR") ?? "",
      messages: [
        { role: "system", content: INSTRUCCION },
        { role: "user", content: turnoCompletoTexto },
      ],
      response_format: { type: "json_schema", json_schema: { name: "ficha", schema: ESQUEMA_FICHA, strict: true } },
      max_completion_tokens: 400,
    },
    fetcher,
  );
  if (!r || !r.contenido) return null;
  let cruda: Record<string, unknown>;
  try {
    cruda = JSON.parse(r.contenido);
  } catch (e) {
    console.error("extraer: la respuesta no fue JSON válido", r.contenido, e);
    return null;
  }
  const { ficha, descartados } = validarExtraccion(cruda);
  return { ficha, descartados, tokensIn: r.uso.tokensIn, tokensOut: r.uso.tokensOut, tokensCacheados: r.uso.tokensCacheados, ms: r.ms };
}
