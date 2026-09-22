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

Deno.test("cuántos mensajes según el largo: hasta el primer tope, 1; hasta el segundo, 2; más, 3", () => {
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

// Los topes se leen de las constantes a proposito: cuando Mateo pide mensajes mas cortos (o mas
// largos) se cambia el numero en preparar.ts y esta prueba sigue valiendo. Escritos a mano, esta
// prueba fallaba por el cambio de tope y no por una regresion, que es ruido.
Deno.test("bordes: justo en el tope sale en 1 mensaje, uno mas arriba en 2, y asi", () => {
  for (const [n, partes] of [[HASTA_UN_MENSAJE, 1], [HASTA_UN_MENSAJE + 1, 2], [HASTA_DOS_MENSAJES, 2], [HASTA_DOS_MENSAJES + 1, 3]] as const) {
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

// Pedido de Mateo (21/9): los pasos van "1 x 1 con algunos emojis", y cuando hay que dar
// información tiene que ir en UN mensaje. Partir una lista en tres globos la deja de ser lista:
// llegan tres mensajes sueltos y, si Meta se demora con uno, encima desordenados.
const SALTO = String.fromCharCode(10);
const PASOS = [
  "1⃣ Venís al local y te tomamos las medidas.",
  "2⃣ Elegís el modelo y el color.",
  "3⃣ Te lo probás la semana antes del evento.",
].join(SALTO);

// Las dos pruebas de abajo ponen la lista JUSTO donde caeria el corte (a la mitad del texto,
// que es donde partir() busca cortar cuando van dos partes). Sin eso, el corte natural cae lejos
// de la lista y la prueba pasa igual con el filtro apagado: probe las dos versiones y la primera
// no atrapaba nada.
// Como llega de verdad: la intro y los pasos son UN parrafo, sin linea en blanco en el medio.
// Importa la diferencia. Si la lista viene rodeada de lineas en blanco, el cortador ya prefiere
// cortar ahi y la lista se salva sola — probe esa version primero y pasaba con el filtro apagado,
// o sea que no probaba nada. Pegada a la intro, los unicos cortes cerca del medio son los puntos
// que terminan cada paso: ahi es donde el filtro hace falta de verdad.
const CON_INTRO = [
  "Te cuento como es, es bien simple y no te lleva mas de un rato.",
  PASOS,
  "Cualquier duda me decis y lo vemos, no hay apuro ninguno.",
].join(String.fromCharCode(10));

Deno.test("un bloque de pasos no se parte, aunque el corte caiga justo adentro", () => {
  assert(CON_INTRO.length > HASTA_UN_MENSAJE, "tiene que ser largo para que se parta");
  const salida = prepararParaEnviar([CON_INTRO]);
  assert(salida.length > 1, "con este largo tiene que salir en varias partes");
  const conPaso1 = salida.filter((p) => p.includes("tomamos las medidas"));
  assertEquals(conPaso1.length, 1, "el paso 1 tiene que estar en exactamente un mensaje");
  const parte = conPaso1[0];
  assert(parte.includes("Elegis el modelo") || parte.includes("Elegís el modelo"), "el paso 2 quedo en otro mensaje");
  assert(parte.includes("Te lo probas") || parte.includes("Te lo probás"), "el paso 3 quedo en otro mensaje");
});

Deno.test("ningun mensaje sale con la lista cortada por la mitad", () => {
  const marcas = ["tomamos las medidas", "el modelo y el color", "la semana antes del evento"];
  for (const relleno of [0, 40, 80, 120, 200, 300, 400]) {
    const entrada = relleno === 0 ? CON_INTRO : `${CON_INTRO}${String.fromCharCode(10)}${texto(relleno)}`;
    for (const parte of prepararParaEnviar([entrada])) {
      const cuantos = marcas.filter((m) => parte.includes(m)).length;
      assert(cuantos === 0 || cuantos === 3, `con ${relleno} de relleno, una parte quedo con ${cuantos} pasos`);
    }
  }
});

Deno.test("una sola línea con emoji no es una lista (caso parecido, no se rompe)", () => {
  // Hacen falta dos seguidas. Una oración suelta que arranca con emoji se sigue pudiendo cortar
  // como cualquier otra, si no esto congelaría medio texto por un emoji de adorno.
  const unaSola = "✅ Listo, te esperamos en el local el jueves a las 15.";
  const salida = prepararParaEnviar([texto(400), unaSola, texto(400)]);
  assert(salida.length > 1);
});

Deno.test("si todo el mensaje es la lista, sale en uno solo aunque sea largo", () => {
  const largaDeVerdad = Array.from({ length: 12 }, (_, i) => `${i % 10}⃣ Paso número ${i} con su explicación bien larga para estirar el texto.`).join(SALTO);
  assert(largaDeVerdad.length > HASTA_DOS_MENSAJES);
  assertEquals(prepararParaEnviar([largaDeVerdad]).length, 1);
});
