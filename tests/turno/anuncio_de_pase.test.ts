// El anuncio del pase sale una sola vez (anuncio_de_pase.ts, ensayo del 10/10): código puro.

import { assertEquals } from "jsr:@std/assert@1.0.13";
import { sinAnuncioDePase } from "../../supabase/functions/_shared/turno/anuncio_de_pase.ts";

Deno.test("se saca el anuncio del pase y queda lo demás que contestó", () => {
  assertEquals(
    sinAnuncioDePase(
      "También vendemos trajes, sin turno, en Córdoba 1369, Rioja 1615 y España 764. Te paso la tienda online; para confirmar la compra del saco por separado, te paso con el equipo.",
    ),
    "También vendemos trajes, sin turno, en Córdoba 1369, Rioja 1615 y España 764. Te paso la tienda online.",
  );
  assertEquals(sinAnuncioDePase("Le paso tu consulta al equipo del local para que te lo confirme."), "");
  assertEquals(sinAnuncioDePase("Gracias por esperar. En un rato te escriben del local."), "Gracias por esperar.");
});

Deno.test("sin anuncio del pase, el texto queda igual", () => {
  const texto = "Te paso el catálogo para que veas los modelos.\n\nPara qué fecha es el evento?";
  assertEquals(sinAnuncioDePase(texto), texto);
});
