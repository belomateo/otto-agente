import { assertEquals } from "jsr:@std/assert@1.0.13";
import { telefonoParaMeta } from "./telefono.ts";

Deno.test("telefonoParaMeta: arma el número internacional o devuelve null", () => {
  assertEquals(telefonoParaMeta("5493415104980"), "5493415104980");
  assertEquals(telefonoParaMeta("+54 9 341 510-4980"), "5493415104980");
  assertEquals(telefonoParaMeta("3415104980"), "5493415104980");
  assertEquals(telefonoParaMeta("543415104980"), "5493415104980");
  assertEquals(telefonoParaMeta("0341 15 5104980"), "5493415104980");
  assertEquals(telefonoParaMeta("447710173736"), "447710173736");
  assertEquals(telefonoParaMeta("sin teléfono · Gabriela Ruggiero"), null);
  assertEquals(telefonoParaMeta("29018383"), null);
  assertEquals(telefonoParaMeta(null), null);
});
