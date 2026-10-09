// Precios de OpenAI por millón de tokens (página oficial developers.openai.com/api/docs/pricing,
// 8/10/2026; los del 14/9 estaban cinco veces arriba para gpt-5.6-luna y el panel mostraba el
// costo inflado). Sirven solo para estimar consumo_llm.costo_usd (STACK.md § 3: "Es lo único
// que sirve para hablar de contexto y costo"); la factura real la da OpenAI. No son un dato del
// negocio (no le llegan al cliente), así que van en código, a diferencia de precios de catálogo.
//
// Actualizar cuando cambien los modelos elegidos (LLM_PRINCIPAL/CLASIFICADOR/EXTRACTOR/ANALISTA
// en .env) o cuando OpenAI cambie precios. Si un modelo no está acá, se factura como si costara
// cero y se avisa por consola (mejor una fila con costo en 0 que un turno que se cae por esto).
export type PrecioModelo = { entradaPorMillon: number; entradaCacheadaPorMillon: number; salidaPorMillon: number };

export const PRECIOS: Record<string, PrecioModelo> = {
  "gpt-6.1-sol": { entradaPorMillon: 2, entradaCacheadaPorMillon: 0.1, salidaPorMillon: 10 },
  "gpt-6-sol": { entradaPorMillon: 2, entradaCacheadaPorMillon: 0.2, salidaPorMillon: 10 },
  "gpt-6-luna": { entradaPorMillon: 0.1, entradaCacheadaPorMillon: 0.01, salidaPorMillon: 0.5 },
  "gpt-5.6-sol": { entradaPorMillon: 4, entradaCacheadaPorMillon: 0.4, salidaPorMillon: 20 },
  "gpt-5.6-terra": { entradaPorMillon: 2, entradaCacheadaPorMillon: 0.2, salidaPorMillon: 12 },
  "gpt-5.6-luna": { entradaPorMillon: 0.2, entradaCacheadaPorMillon: 0.02, salidaPorMillon: 1.2 },
  "gpt-5.4-mini": { entradaPorMillon: 0.75, entradaCacheadaPorMillon: 0.075, salidaPorMillon: 4.5 },
  "gpt-5.4-nano": { entradaPorMillon: 0.2, entradaCacheadaPorMillon: 0.02, salidaPorMillon: 1.25 },
};

export function costoUsd(modelo: string, tokensIn: number, tokensOut: number, tokensCacheados = 0): number {
  const p = PRECIOS[modelo];
  if (!p) {
    console.error(`consumo_llm: no hay precio cargado para "${modelo}"; se registra costo 0. Sumalo a precios.ts.`);
    return 0;
  }
  const sinCachear = Math.max(0, tokensIn - tokensCacheados);
  const costo =
    (sinCachear * p.entradaPorMillon + tokensCacheados * p.entradaCacheadaPorMillon + tokensOut * p.salidaPorMillon) / 1_000_000;
  return Math.round(costo * 1_000_000) / 1_000_000; // redondeado a la millonésima de dólar
}

// Transcripción (pedido de Mateo, 19/9: leer audios): OpenAI la factura por minuto de audio, no
// por token — no entra en PRECIOS/costoUsd de arriba. Estimado a groso modo (no es la factura
// real, igual que el resto de este archivo); sirve para que consumo_llm no quede en 0 y se vea
// que la charla gastó algo. Actualizar si cambia el modelo de transcripción (LLM_TRANSCRIPCION).
const PRECIO_TRANSCRIPCION_USD_POR_MINUTO = 0.006;

export function costoTranscripcionUsd(segundos: number): number {
  const costo = (segundos / 60) * PRECIO_TRANSCRIPCION_USD_POR_MINUTO;
  return Math.round(costo * 1_000_000) / 1_000_000;
}
