// Derivación dura por palabra clave, código puro (CLAUDE.md § 2: "Detectar palabras de
// derivación dura (reclamo, dañ*, corporativo, uniforme)" es código; el LLM_CLASIFICADOR es la
// red para cuando NO hay palabra clave). Corre antes de llamar a ningún modelo (AGENTE.md § 3
// paso 4), sobre el mensaje sin acentos y en minúsculas, para que "reclamo", "RECLAMO" o
// "reclamó" agarren igual.
//
// evento_inminente (decisión #8, 14/9) también se decide acá si la ficha YA tiene la fecha del
// evento (de un turno anterior): si el cliente recién ahora la menciona, la agarra
// buscar_horarios/agendar_turno más adelante en el mismo turno (herramientas/derivacion.ts).

import type { MotivoDerivacion } from "../enums.ts";
import { esEventoInminente } from "../herramientas/derivacion.ts";
import { normalizar } from "../barandillas/texto.ts";

export type DerivacionDura = { motivo: MotivoDerivacion; porQue: string };

// dañ* cubre dañado/dañada/dañó/daños. "manchad*" se suma porque la ficha del negocio habla de
// "prenda dañada o manchada" (AGENTE.md § 5, regla 13) con las mismas palabras.
const PALABRAS: { motivo: MotivoDerivacion; patron: RegExp; porQue: string }[] = [
  { motivo: "reclamo", patron: /\breclam\w*/, porQue: "la palabra \"reclamo\"" },
  { motivo: "prenda_danada", patron: /\bdañ\w*/, porQue: "la palabra \"dañ...\"" },
  { motivo: "prenda_danada", patron: /\bmanchad\w*/, porQue: "la palabra \"manchad...\"" },
  { motivo: "corporativo", patron: /\bcorporativ\w*/, porQue: "la palabra \"corporativo\"" },
  { motivo: "corporativo", patron: /\bunifor\w*/, porQue: "la palabra \"uniforme\"" },
];

export function derivacionDuraPorPalabraClave(mensaje: string): DerivacionDura | null {
  const n = normalizar(mensaje);
  for (const p of PALABRAS) {
    if (p.patron.test(n)) return { motivo: p.motivo, porQue: p.porQue };
  }
  return null;
}

export function derivacionDuraPorEventoInminente(fechaEvento: string | null, ahora: Date, tz: string): DerivacionDura | null {
  if (!esEventoInminente(fechaEvento, ahora, tz)) return null;
  return { motivo: "evento_inminente", porQue: `la fecha del evento ya cargada (${fechaEvento}) es hoy o mañana` };
}
