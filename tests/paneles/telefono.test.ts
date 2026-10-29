import { assertEquals } from "jsr:@std/assert@1";
import { telefonoWhatsapp } from "../../panel/lib/telefono.ts";

Deno.test("telefonoWhatsapp: como lo tipea el equipo → como llega de WhatsApp", () => {
  assertEquals(telefonoWhatsapp("3454093217"), "5493454093217");
  assertEquals(telefonoWhatsapp("341 555-1234"), "5493415551234");
  assertEquals(telefonoWhatsapp("0341 5551234"), "5493415551234");
  assertEquals(telefonoWhatsapp("+54 341 555 1234"), "5493415551234");
  assertEquals(telefonoWhatsapp("+54 9 341 555 1234"), "5493415551234");
  assertEquals(telefonoWhatsapp("393513767539"), "393513767539"); // Italia: no se toca
});
