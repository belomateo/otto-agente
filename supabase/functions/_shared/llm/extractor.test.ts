// validarExtraccion es pura (sin base ni red): re-chequea cada campo que devolvió el modelo
// contra su propio formato antes de que actualizarFicha escriba nada (hito 2.3, principio 6 de
// CLAUDE.md § 2 — si no pasa la validación, no es un hecho, es ruido). Acá solo el mail: los
// demás campos (evento, rol, fecha_evento) ya tenían su propia cobertura en los guiones del
// emulador.

import { assertEquals } from "jsr:@std/assert@1";
import { validarExtraccion } from "./extractor.ts";

Deno.test("validarExtraccion: un mail con forma de mail se guarda", () => {
  const { ficha, descartados } = validarExtraccion({ email: "juan@gmail.com" });
  assertEquals(ficha.email, "juan@gmail.com");
  assertEquals(descartados, []);
});

Deno.test("validarExtraccion: un mail sin @ ni punto se descarta, no se guarda", () => {
  const { ficha, descartados } = validarExtraccion({ email: "juan arroba gmail" });
  assertEquals(ficha.email, undefined);
  assertEquals(descartados, [`email="juan arroba gmail" (no tiene forma de mail)`]);
});

Deno.test("validarExtraccion: null en el mail no es un descarte, es que no lo dijo", () => {
  const { ficha, descartados } = validarExtraccion({ email: null });
  assertEquals(ficha.email, undefined);
  assertEquals(descartados, []);
});

Deno.test("validarExtraccion: un mail con mayúsculas o espacios de más igual pasa (se normaliza al guardar)", () => {
  const { ficha, descartados } = validarExtraccion({ email: "  Juan@Gmail.com  " });
  assertEquals(ficha.email, "Juan@Gmail.com");
  assertEquals(descartados, []);
});
