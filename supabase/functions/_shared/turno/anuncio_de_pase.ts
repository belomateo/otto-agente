// El anuncio del pase, una sola vez (ensayo de 44 charlas reales, 10/10). Cuando Lucía pasa la
// charla con derivar_a_persona, el cliente recibe su texto y además la despedida de la herramienta.
// Si el texto ya anunciaba el pase, salía dos veces: «…para confirmar la compra del saco por
// separado, te paso con el equipo. ⏎ Andrés, te paso con el equipo para que te orienten…». Se sacan
// del texto las partes que anuncian el pase (la despedida lo dice mejor, con el nombre); lo demás
// que contestó antes de pasarla sale igual.

import { normalizar, oraciones, rearmar } from "../barandillas/texto.ts";

const ANUNCIA_EL_PASE =
  /\b(?:te|les) paso con\b|\bpaso (?:tu|la|su) consulta\b|\bles paso (?:tu|la|su) consulta\b|\bte (?:van a|va a) (?:escribir|contactar)\b|\ben un rato te escriben\b|\bte escribe(?:n)? (?:alguien|el equipo|una persona)\b|\bya les avise\b/;

export function sinAnuncioDePase(texto: string): string {
  const quedan = oraciones(texto).flatMap((o) => {
    // Una oración puede juntar algo útil y el anuncio con «;» («Te paso la tienda; para la compra
    // del saco, te paso con el equipo»): se mira cada parte.
    const partes = o.texto.split(/;\s*/).filter((p) => !ANUNCIA_EL_PASE.test(normalizar(p)));
    if (!partes.length) return [];
    const unida = partes.join("; ").trim();
    return [{ parrafo: o.parrafo, texto: /[.!?…]$/.test(unida) ? unida : `${unida}.` }];
  });
  return rearmar(quedan);
}
