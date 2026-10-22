// panel/lib/respuestas-rapidas.ts: cuándo se abre la lista "/" y qué muestra (pedido de Sofía,
// 22/10). Puro: `deno test tests/paneles/respuestas-rapidas.test.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import { atajoEnCurso, filtrarRespuestas, insertarRespuesta, type RespuestaRapida } from "../../panel/lib/respuestas-rapidas.ts";

const r = (atajo: string, orden: number, activo = true, texto = ""): RespuestaRapida => ({ id: atajo, atajo, texto, orden, activo });

Deno.test("'/' se abre al principio o después de un espacio, no adentro de un link", () => {
  assertEquals(atajoEnCurso("/pre", 4), { inicio: 0, consulta: "pre" });
  assertEquals(atajoEnCurso("hola /", 6), { inicio: 5, consulta: "" });
  assertEquals(atajoEnCurso("https://x.com/a", 15), null);
  assertEquals(atajoEnCurso("/precios ya", 11), null); // ya cerró con un espacio
});

Deno.test("la lista va por orden, sin las inactivas, y filtra sin tildes por atajo o texto", () => {
  const lista = [r("direccion", 5), r("precios", 2), r("catalogo", 3, false), r("como-funciona", 1, true, "Te cuento cómo es")];
  assertEquals(filtrarRespuestas(lista, "").map((x) => x.atajo), ["como-funciona", "precios", "direccion"]);
  assertEquals(filtrarRespuestas(lista, "DIRECCIÓN").map((x) => x.atajo), ["direccion"]);
  assertEquals(filtrarRespuestas(lista, "cuento").map((x) => x.atajo), ["como-funciona"]);
});

Deno.test("insertar reemplaza solo el /consulta y deja el cursor al final del texto insertado", () => {
  assertEquals(insertarRespuesta("hola /pre chau", 9, 5, "Sale $1"), { texto: "hola Sale $1 chau", cursor: 12 });
});
