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

// Fecha del evento: el modelo le pone el año, y a veces le pone uno que ya pasó. Hasta el 24/9
// esto se escribía en la ficha sin más, y el daño no se veía acá: a partir de ese momento
// buscar_horarios y agendar_turno la rechazan los dos, Lucía le dice al cliente que SU fecha ya
// pasó, y el cliente no puede sacar turno nunca. Los otros tres caminos que escriben la ficha ya
// la rechazaban; este era el único que no. Red-team: en 2 de 6 charlas, "20 de junio" quedó como
// 2025-06-20 y "25 de octubre" como 2025-10-25.
Deno.test("validarExtraccion: una fecha de evento que ya pasó se descarta, no se guarda", () => {
  const { ficha, descartados } = validarExtraccion({ fecha_evento: "2025-06-20" }, "2026-09-25");
  assertEquals(ficha.fecha_evento, undefined);
  assertEquals(descartados, [`fecha_evento="2025-06-20" (ya pasó: hoy es 2026-09-25)`]);
});

Deno.test("validarExtraccion: la fecha de hoy y las futuras sí se guardan", () => {
  assertEquals(validarExtraccion({ fecha_evento: "2026-09-25" }, "2026-09-25").ficha.fecha_evento, "2026-09-25");
  assertEquals(validarExtraccion({ fecha_evento: "2027-03-07" }, "2026-09-25").ficha.fecha_evento, "2027-03-07");
});

// Sin `hoy` no se puede saber si pasó, y no se inventa un "hoy" acá adentro para que la función
// siga siendo pura: quien llama (turno.ts) tiene la hora y la zona del negocio y se lo pasa.
Deno.test("validarExtraccion: sin `hoy`, la fecha pasada pasa igual (la puerta la pone quien llama)", () => {
  assertEquals(validarExtraccion({ fecha_evento: "2025-06-20" }).ficha.fecha_evento, "2025-06-20");
});
