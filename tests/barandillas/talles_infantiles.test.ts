import { assertEquals } from 'jsr:@std/assert@1.0.13';
import { montos } from '../../supabase/functions/_shared/barandillas/precio_sin_herramienta.ts';
Deno.test('los talles infantiles 4 al 16 no son precios', () => {
  for (const texto of ['Tenemos talles de niños del 4 al 16.', 'Talles 4–16.', 'De 4 a 16.', 'Tenemos talle 4 y talle 16.']) assertEquals(montos(texto), [], texto);
  assertEquals(montos('El talle 4 cuesta 16.'), [16]);
  assertEquals(montos('Talles del 4 al 16, a $150.000.'), [150000]);
});
