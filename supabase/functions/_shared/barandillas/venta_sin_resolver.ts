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
// Historia del criterio: primero "no derives, mandá el link"; después (21/9) Mateo pidió las DOS
// cosas, link Y derivación; y finalmente (29/9) volvió a "solo el link": la compra la resuelve la
// web de venta —ahí asesoran al cliente—, así que no tiene sentido ocupar a una persona del local
// por una venta. Hoy alcanza con mandoElLinkDeVenta(traza); la derivación quedó fuera.

import { type Traza } from "../traza.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

// 8/10: también cuenta el link de venta que ya le llegó antes en la charla. Sin esto, cada vez que
// el cliente volvía a hablar de comprar, la barandilla obligaba a "mandar" de nuevo el link (que
// enviar_link ya no reenvía) y a repetir «ahí te asesoran con la compra» (caso real, 8/10: tres
// veces en cuatro minutos, sin contestarle nunca cuánto salía).
function mandoElLinkDeVenta(traza: Traza): boolean {
  return (traza.linksPrevios ?? []).includes("web-venta") || traza.llamadas.some(
    (l) => l.herramienta === "enviar_link" && l.ok && (l.argumentos as { tipo?: string } | null)?.tipo === "web-venta",
  );
}

export const ventaSinResolver: Barandilla = {
  nombre: "venta_sin_resolver",
  etapa: "reglas",
  accion: "rehacer",
  evaluar({ traza, intencion }) {
    if (intencion !== "venta") return NO_SALTA;
    // Pedido de Mateo, 29/9: la venta ya NO se deriva a una persona. Alcanza con mandar el link de
    // la web de venta (donde al cliente lo asesoran con la compra), en el mismo turno. Antes se
    // exigían las dos cosas —link Y derivación—; ahora sobra la derivación: la compra la resuelve
    // la web, no el equipo del local. Lo único que se sigue mirando es que el link salga de verdad.
    if (mandoElLinkDeVenta(traza)) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: "el clasificador entendió que la consulta es de venta y el turno no mandó el link de venta: " +
        "mandá enviar_link con tipo web-venta y decile que ahí lo asesoran con la compra de su traje. No hace falta derivar.",
    };
  },
};
