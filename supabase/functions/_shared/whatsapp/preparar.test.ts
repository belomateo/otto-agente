import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  cuantosMensajes,
  HASTA_DOS_MENSAJES,
  HASTA_UN_MENSAJE,
  MAXIMO_DE_MENSAJES,
  PARTE_MINIMA,
  prepararParaEnviar,
  sinSignosDeApertura,
} from "./preparar.ts";

// Un texto de exactamente `n` caracteres hecho de oraciones de 44 ("La oración número 000 del
// texto de prueba. "), para probar los bordes del largo. Nunca termina en espacio.
function texto(n: number): string {
  let t = "";
  for (let i = 0; t.length < n + 60; i++) t += `La oración número ${String(i).padStart(3, "0")} del texto de prueba. `;
  t = t.slice(0, n);
  return t.endsWith(" ") ? `${t.slice(0, -1)}x` : t;
}
const normal = (t: string) => t.replace(/\s+/g, " ").trim();
const sinSurrogateSuelto = (t: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t);

Deno.test("cuántos mensajes según el largo: hasta 300, 1; hasta 700, 2; más, 3", () => {
  assertEquals([1, HASTA_UN_MENSAJE, HASTA_UN_MENSAJE + 1, HASTA_DOS_MENSAJES, HASTA_DOS_MENSAJES + 1, 5000].map(cuantosMensajes), [
    1,
    1,
    2,
    2,
    MAXIMO_DE_MENSAJES,
    MAXIMO_DE_MENSAJES,
  ]);
});

Deno.test("saca ¡ y ¿, también al principio de una línea, y limpia los espacios que quedan", () => {
  assertEquals(sinSignosDeApertura("¡Hola, Lucas! ¿Cómo estás?"), "Hola, Lucas! Cómo estás?");
  assertEquals(sinSignosDeApertura("Perfecto.\n¿Te sirve el martes?"), "Perfecto.\nTe sirve el martes?");
  assertEquals(sinSignosDeApertura("  ¿ Dale ?  "), "Dale ?");
  assertEquals(prepararParaEnviar(["¡Perfecto!", "¿Te sirve el martes a las 13?"]), ["Perfecto!\n\nTe sirve el martes a las 13?"]);
});

Deno.test("bordes: 300 caracteres salen en 1 mensaje, 301 en 2, 700 en 2 y 701 en 3", () => {
  for (const [n, partes] of [[300, 1], [301, 2], [700, 2], [701, 3]] as const) {
    const original = texto(n);
    assertEquals(original.length, n);
    const salida = prepararParaEnviar([original]);
    assertEquals(salida.length, partes, `${n} caracteres`);
    assertEquals(normal(salida.join(" ")), normal(original), `${n}: no se pierde ni se agrega nada`);
    assert(salida.every((p) => p.length >= PARTE_MINIMA), `${n}: ninguna parte de menos de ${PARTE_MINIMA}`);
  }
});

Deno.test("corta en el fin de oración, nunca en el medio de una", () => {
  for (const parte of prepararParaEnviar([texto(650)]).slice(0, -1)) assert(/[.!?]$/.test(parte), `termina en «${parte.slice(-12)}»`);
});

Deno.test("prefiere el fin de párrafo: dos párrafos de 200 salen como esos dos párrafos", () => {
  const a = texto(200);
  const b = `Y además: ${texto(190)}`;
  assertEquals(prepararParaEnviar([`${a}\n\n${b}`]), [a, b]);
});

Deno.test("sin ningún lugar donde cortar, un solo mensaje aunque sea largo", () => {
  const sinPuntos = Array(160).fill("abcd").join(" ");
  assertEquals(prepararParaEnviar([sinPuntos]), [sinPuntos]);
});

Deno.test("un link nunca se corta", () => {
  const link = "https://maps.app.goo.gl/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789?g_st=ic";
  const salida = prepararParaEnviar([`${texto(170)} Mirá cómo llegar acá: ${link} y cualquier cosa me escribís. ${texto(200)}`]);
  assert(salida.length > 1);
  const conLink = salida.filter((p) => p.includes("https://"));
  assertEquals(conLink.length, 1);
  assert(conLink[0].includes(link));
});

Deno.test("los emojis no se rompen", () => {
  const salida = prepararParaEnviar([Array(40).fill("Listo, te espero 😊.").join(" ")]);
  assert(salida.length > 1);
  assert(salida.every(sinSurrogateSuelto));
});

Deno.test("nada que mandar: vacío", () => {
  assertEquals(prepararParaEnviar([]), []);
  assertEquals(prepararParaEnviar(["", null, undefined, "   ", "¡¿"]), []);
});

Deno.test("nunca más de 3 mensajes, aunque sea muy largo", () => {
  assertEquals(prepararParaEnviar([texto(3000)]).length, MAXIMO_DE_MENSAJES);
});

Deno.test("un pedacito corto queda pegado a la parte vecina", () => {
  const salida = prepararParaEnviar(["Listo.", texto(400)]);
  assertEquals(salida.length, 2);
  assert(salida[0].startsWith("Listo.\n\n"));
  assert(salida.every((p) => p.length >= PARTE_MINIMA));
});

Deno.test("aplicarla a su propia salida no cambia nada", () => {
  for (const entrada of [[texto(250)], [texto(450)], [texto(699)], [texto(900)], [`${texto(200)}\n\n${texto(190)}`], ["¡Hola!", "¿Qué tal?"]]) {
    const una = prepararParaEnviar(entrada);
    assertEquals(prepararParaEnviar(una), una);
  }
});
