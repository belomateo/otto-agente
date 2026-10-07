import { assertEquals } from "jsr:@std/assert@1.0.13";
import { aplicarBarandillas } from "../../supabase/functions/_shared/barandillas/index.ts";
import { disponibilidadNegada } from "../../supabase/functions/_shared/barandillas/disponibilidad_negada.ts";
import { esCierreCortes } from "../../supabase/functions/_shared/turno/cierre_cortes.ts";
import { entrada } from "./_ayuda.ts";
Deno.test("negativas comerciales se rehacen en el primer intento", async () => {
  for (const texto of ["No tenemos talles de niños, pero sí de adultos.", "Ese modelo está agotado.", "No hay disponibilidad.", "No alquilamos zapatos."]) {
    const r = await aplicarBarandillas(entrada(texto));
    assertEquals(r.decision, "rehacer", texto);
  }
});
Deno.test("negativa que persiste después del rehacer cae a barandilla_doble", async () => {
  const r = await aplicarBarandillas(entrada("No tenemos ese modelo."), { saltosPrevios: 1 });
  assertEquals(r.decision, "derivar");
  assertEquals(r.motivoDerivacion, "barandilla_doble");
});
// Política confirmada, no falta de stock (caso real del 4/10): no deriva.
Deno.test("«no hacemos envíos» explicado con la política no deriva", async () => {
  const texto = "No hacemos envíos: el traje se prueba, se retira y se devuelve en el local de España 764.";
  assertEquals((await disponibilidadNegada.evaluar(entrada(texto))).salta, false);
});
Deno.test("no confunde tranquilidad ni información positiva con falta de stock", async () => {
  for (const texto of ["No hay problema.", "No tenemos que pedirte el nombre.", "No encuentro un turno tuyo agendado.", "Sí tenemos talles infantiles del 4 al 16."]) assertEquals((await disponibilidadNegada.evaluar(entrada(texto))).salta, false, texto);
});
Deno.test("agradecimientos no vuelven a disparar la venta; preguntas y confirmaciones siguen", () => {
  for (const t of ["Ok.", "Muchas gracias por tu atención.", "Ok. Muchas gracias por su atención", "Gracias 😊"]) assertEquals(esCierreCortes(t), true, t);
  for (const t of ["Dale", "Sí", "Confirmo", "Gracias, ¿tienen talle 8?", "Gracias quiero reservar", "Ok el viernes", "Gracias por confirmar el turno"]) assertEquals(esCierreCortes(t), false, t);
});
