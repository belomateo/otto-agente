import { assertEquals } from "jsr:@std/assert@1";
import { firmaValida } from "./firma.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

// Vector de prueba 2 de la RFC 4231 (HMAC-SHA256): no depende de cómo calcula firma.ts.
const RFC_CLAVE = "Jefe";
const RFC_CUERPO = bytes("what do ya want for nothing?");
const RFC_FIRMA = "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

Deno.test("firma correcta (vector de la RFC 4231): pasa", async () => {
  assertEquals(await firmaValida(RFC_CUERPO, RFC_FIRMA, RFC_CLAVE), true);
});

Deno.test("la misma firma en mayúsculas: pasa", async () => {
  assertEquals(await firmaValida(RFC_CUERPO, "sha256=" + RFC_FIRMA.slice(7).toUpperCase(), RFC_CLAVE), true);
});

Deno.test("firmada con otro secreto: no pasa", async () => {
  assertEquals(await firmaValida(RFC_CUERPO, RFC_FIRMA, "otro-secreto"), false);
});

Deno.test("cuerpo alterado en un solo carácter: no pasa", async () => {
  assertEquals(await firmaValida(bytes("what do ya want for nothing!"), RFC_FIRMA, RFC_CLAVE), false);
});

Deno.test("sin cabecera, sin el prefijo sha256= o con largo distinto: no pasa", async () => {
  assertEquals(await firmaValida(RFC_CUERPO, null, RFC_CLAVE), false);
  assertEquals(await firmaValida(RFC_CUERPO, RFC_FIRMA.slice(7), RFC_CLAVE), false);
  assertEquals(await firmaValida(RFC_CUERPO, "sha256=abc", RFC_CLAVE), false);
});

Deno.test("App Secret vacío (sin cargar): no pasa nunca, ni con cabecera", async () => {
  assertEquals(await firmaValida(RFC_CUERPO, RFC_FIRMA, ""), false);
});
