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
    if (mandoElLinkDeVenta(traza) || derivo(traza)) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: "el clasificador entendió que la consulta es de venta y el turno no mandó el link de venta ni derivó: " +
        "llamá a enviar_link con tipo web-venta, o derivá con motivo dato_no_encontrado si no alcanza",
    };
  },
};
