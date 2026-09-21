// venta_sin_resolver (reglas) — barandilla ESTRUCTURAL, no de palabras (pedido de logica, 20/9).
//
// El problema real: cuando el cliente pregunta por comprar (no alquilar), Lucía tiene que
// mandarle el link de venta (enviar_link, tipo web-venta) o derivar. Antes de esto, lo único que
// existía para atajar un pase silencioso ("le paso esto a una persona" sin llamar realmente a
// derivar_a_persona) era anuncia_sin_derivar, que mira FRASES. Probando en vivo, logica mostró
// que eso es un juego perdido: bloqueada "te puede orientar el equipo del local", el modelo se
// mudó a "eso te lo confirma el equipo del local" —la frase que el propio prompt aprueba para
// otra cosa (no contar cómo funciona por dentro)— y quedó exactamente el mismo agujero con otra
// redacción. Cada frase que se agregue a esa lista, el modelo tiene otra forma de decir lo
// mismo, y cuantas más se agreguen, más cerca se está de romper el español legítimo.
//
// La idea de logica: no mirar CÓMO lo dice, mirar si LO RESOLVIÓ. El dato que separa un turno
// bien resuelto de uno que dejó a alguien a mitad de camino no está en el texto, está en la
// traza: si el clasificador entendió "venta" y el turno no llamó a enviar_link(web-venta) ni a
// derivar_a_persona, no importa qué haya escrito Lucía — el cliente se quedó sin el link y sin
// una persona. Mismo patrón que accesorio_sin_herramienta: mira la traza, no el texto.
//
// Pedido de Mateo, 21/9 (le llegó por Mateo → logica): el primer pedido era "no derives, mandá el
// link" (o sea, alcanzaba con una de las dos). Mateo lo afinó: para venta ahora hacen falta las
// DOS cosas en el mismo turno, no una — el link para que el cliente vaya mirando YA, y la
// derivación para que alguien del equipo lo siga (así no queda solo con un link y nadie
// enterado). Antes bastaba mandoElLinkDeVenta(traza) || derivo(traza); ahora hace falta AND.
// derivar_a_persona corta el turno, pero corta DESPUÉS de ejecutarse: el tools loop permite hasta
// 6 llamadas por turno (AGENTE.md § "tools loop"), así que el modelo puede llamar enviar_link y
// recién después derivar_a_persona en la misma vuelta sin problema.

import { type Traza } from "../traza.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

function mandoElLinkDeVenta(traza: Traza): boolean {
  return traza.llamadas.some(
    (l) => l.herramienta === "enviar_link" && l.ok && (l.argumentos as { tipo?: string } | null)?.tipo === "web-venta",
  );
}

function derivo(traza: Traza): boolean {
  return traza.llamadas.some((l) => l.herramienta === "derivar_a_persona" && l.ok);
}

export const ventaSinResolver: Barandilla = {
  nombre: "venta_sin_resolver",
  etapa: "reglas",
  accion: "rehacer",
  evaluar({ traza, intencion }) {
    if (intencion !== "venta") return NO_SALTA;
    const link = mandoElLinkDeVenta(traza);
    const derivada = derivo(traza);
    if (link && derivada) return NO_SALTA;
    const falta = !link && !derivada
      ? "no mandó el link de venta ni derivó"
      : !link
      ? "derivó pero no mandó el link de venta"
      : "mandó el link de venta pero no derivó";
    return {
      salta: true,
      accion: "rehacer",
      motivo: `el clasificador entendió que la consulta es de venta y el turno ${falta}: ` +
        "para venta hacen falta las dos cosas en el mismo turno — enviar_link con tipo web-venta " +
        "Y derivar_a_persona con motivo dato_no_encontrado",
    };
  },
};
