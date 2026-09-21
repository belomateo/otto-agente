// La bitácora de un turno (AGENTE.md § 3 paso 11 y § 12): eventos_agente (una fila por evento)
// y consumo_llm (una fila por llamada real a un modelo, con su costo). "La verdad es lo que
// quedó en la base" (principio 9): esto es lo único que un test o el analista nocturno leen
// para saber qué pasó, no lo que el turno "dice" que hizo.

import type { Db } from "../db.ts";
import type { LlamadaLlm } from "../llm/principal.ts";
import { costoUsd } from "../llm/precios.ts";
import type { Traza } from "../traza.ts";

export type EventoAgente = { tipo: "ok" | "error" | "pensamiento" | "herramienta" | "derivacion"; detalle: Record<string, unknown> };

export async function registrarEventos(db: Db, conversacionId: string, eventos: EventoAgente[]): Promise<void> {
  for (const e of eventos) {
    await db.consulta("insert into eventos_agente (conversacion_id, tipo, detalle) values ($1, $2, $3)", [
      conversacionId,
      e.tipo,
      JSON.stringify(e.detalle),
    ]);
  }
}

export async function registrarConsumo(db: Db, conversacionId: string, llamadas: LlamadaLlm[]): Promise<void> {
  for (const l of llamadas) {
    const costo = l.costoUsdDirecto ?? costoUsd(l.modelo, l.uso.tokensIn, l.uso.tokensOut, l.uso.tokensCacheados);
    await db.consulta(
      "insert into consumo_llm (conversacion_id, modelo, tokens_in, tokens_out, costo_usd) values ($1, $2, $3, $4, $5)",
      [conversacionId, l.modelo, l.uso.tokensIn, l.uso.tokensOut, costo],
    );
  }
}

// Un evento 'herramienta' por cada llamada de la traza, con lo que sirve para auditar sin tener
// que ir a buscar la tabla que tocó (AGENTE.md § 12: "cada herramienta con su input/resumen/ok").
export function eventosDeLaTraza(traza: Traza): EventoAgente[] {
  return traza.llamadas.map((l) => ({
    tipo: "herramienta",
    detalle: { herramienta: l.herramienta, argumentos: l.argumentos, ok: l.ok, rechazo: l.rechazo, error: l.error },
  }));
}
