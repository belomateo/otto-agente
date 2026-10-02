import { assertEquals } from 'jsr:@std/assert@1.0.13';
import { esCierreCortes } from '../../supabase/functions/_shared/turno/cierre_cortes.ts';
Deno.test('agradecimientos y despedidas no disparan otra explicación', () => {
  for (const s of ['Ok.', 'Muchas gracias por tu atención.', '¡Gracias Lucía!', 'Mil gracias', 'Hasta luego']) assertEquals(esCierreCortes(s), true, s);
});
Deno.test('no silencia reservas, datos nuevos ni preguntas', () => {
  for (const s of ['Sí', 'Dale', 'Confirmo', 'Perfecto', 'Gracias, mañana a las 16', 'Ok me llamo Aldo', 'Gracias, ¿cuánto sale?', 'Mi correo es aldo@ejemplo.com']) assertEquals(esCierreCortes(s), false, s);
});
Deno.test('ok acepta un horario propuesto y no se confunde con despedida', () => {
  assertEquals(esCierreCortes('Ok.', '¿Te agendo el viernes a las 16?'), false);
  assertEquals(esCierreCortes('Ok.', 'Te puedo ofrecer un turno el viernes.'), false);
  assertEquals(esCierreCortes('Ok.', 'En la web te asesoran con la compra.'), true);
});
