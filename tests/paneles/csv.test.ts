// panel/lib/csv.ts: el armado del CSV de "Exportar CSV" en Clientes (pedido de Mateo, 25/9).
// Puro, sin base: corre con `deno test tests/paneles/csv.test.ts`.
//
// La prueba que más importa es la de fórmulas. Lo que se exporta lo escribieron los clientes por
// WhatsApp, y una celda que empieza con = + - @ Excel la ejecuta: un "nombre" como
// =HYPERLINK("http://...") terminaría siendo un link armado por un desconocido adentro de la
// planilla de la dueña. Si esa prueba se cae, volvió el agujero.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { armarCsv, BOM, celdaCsv, fechaArgentina, momentoArgentina, SEPARADOR } from "../../panel/lib/csv.ts";

Deno.test("csv: una celda que empieza como fórmula se neutraliza con una comilla simple", () => {
  // Con comillas y comas adentro, además queda encomillada: las dos defensas juntas.
  assertEquals(celdaCsv('=HYPERLINK("http://malo","clic")'), `"'=HYPERLINK(""http://malo"",""clic"")"`);
  assertEquals(celdaCsv("+5491155554444"), "'+5491155554444");
  assertEquals(celdaCsv("-2+3"), "'-2+3");
  assertEquals(celdaCsv("@SUMA(A1)"), "'@SUMA(A1)");
  // Un texto normal no se toca.
  assertEquals(celdaCsv("Sofía Benítez"), "Sofía Benítez");
  // Un guión en el medio no es una fórmula.
  assertEquals(celdaCsv("341 638-1754"), "341 638-1754");
});

Deno.test("csv: separador, comillas y saltos de línea quedan encomillados y escapados", () => {
  assertEquals(celdaCsv("uno;dos"), `"uno;dos"`);
  assertEquals(celdaCsv('dijo "hola"'), `"dijo ""hola"""`);
  assertEquals(celdaCsv("linea1\nlinea2"), `"linea1\nlinea2"`);
  assertEquals(celdaCsv(null), "");
  assertEquals(celdaCsv(undefined), "");
  assertEquals(celdaCsv(0), "0");
});

Deno.test("csv: BOM al principio, ';' entre columnas y CRLF entre filas (Excel argentino)", () => {
  const csv = armarCsv(["Nombre", "Ciudad"], [["Ana", "Rosario"], ["Juan", "Funes"]]);
  assert(csv.startsWith(BOM), "sin BOM, Excel abre las tildes rotas");
  assertEquals(SEPARADOR, ";");
  assertEquals(csv, `${BOM}Nombre;Ciudad\r\nAna;Rosario\r\nJuan;Funes\r\n`);
});

Deno.test("csv: la fecha del evento se reordena como texto, sin correrse de día", () => {
  assertEquals(fechaArgentina("2027-06-20"), "20/06/2027");
  // Si llega con hora (según quién la lea), igual se toma el día escrito, no el del huso.
  assertEquals(fechaArgentina("2027-06-20T03:00:00.000Z"), "20/06/2027");
  assertEquals(fechaArgentina(null), "");
});

Deno.test("csv: un instante sale en la hora de Argentina", () => {
  // 17:05 UTC son las 14:05 en Argentina (UTC-3).
  assertEquals(momentoArgentina("2026-09-25T17:05:00Z"), "25/09/2026 14:05");
  assertEquals(momentoArgentina(null), "");
  assertEquals(momentoArgentina("no es una fecha"), "");
});
