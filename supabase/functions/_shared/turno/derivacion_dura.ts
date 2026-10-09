// Derivación dura por código, antes de llamar a ningún modelo (AGENTE.md § 3 paso 4). Queda una
// sola: el evento que ya está en la ficha (de un turno anterior) es hoy o mañana (decisión #8, 14/9)
// — no hay tiempo para una prueba y un ajuste, así que va directo al local. Si el cliente recién
// ahora menciona la fecha, la agarra buscar_horarios/agendar_turno más adelante en el mismo turno
// (herramientas/derivacion.ts).
//
// Hasta el 9/10 también había un filtro por palabra clave («reclamo», «dañ...», «manchad...»,
// «corporativo», «unifor...») que derivaba antes de que Lucía leyera el mensaje. Se sacó por pedido
// de Mateo, junto con el clasificador: esa decisión la toma Lucía con derivar_a_persona. Caso de por
// qué molestaba: «¿tienen trajes para uniformar a los mozos del casamiento?» se iba a una persona
// sin que Lucía lo viera.

import type { MotivoDerivacion } from "../enums.ts";
import { esEventoInminente } from "../herramientas/derivacion.ts";

export type DerivacionDura = { motivo: MotivoDerivacion; porQue: string };

export function derivacionDuraPorEventoInminente(fechaEvento: string | null, ahora: Date, tz: string): DerivacionDura | null {
  if (!esEventoInminente(fechaEvento, ahora, tz)) return null;
  return { motivo: "evento_inminente", porQue: `la fecha del evento ya cargada (${fechaEvento}) es hoy o mañana` };
}
