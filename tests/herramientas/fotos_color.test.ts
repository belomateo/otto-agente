// Revisión del 4/10: a un cliente que pidió gris le salió la foto del Ambo Tech azul oscuro,
// porque enviar_fotos mandaba siempre la primera. Sin base: es la elección de la foto.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { fotoDelColor } from "../../supabase/functions/_shared/herramientas/enviar_fotos.ts";

const TECH = [
  "https://acdn-us.mitiendanube.com/stores/1/products/0203115-0-260_azul-oscuro_b-37713cef-480-0.jpg",
  "https://acdn-us.mitiendanube.com/stores/1/products/0203115-0-260_gris-medio_b-dbc1e977-480-0.jpg",
];
const SMOKING = [
  "https://acdn-us.mitiendanube.com/stores/1/products/0203812-0-250_negro_b-3133d2a2-480-0.jpg",
  "https://acdn-us.mitiendanube.com/stores/1/products/0202112-0-250_azul_b-ef3991ca-480-0.jpg",
];

Deno.test("fotoDelColor elige la foto del color pedido", () => {
  assertEquals(fotoDelColor(TECH, ["Azul Oscuro", "Gris Medio"], "gris"), TECH[1]); // por el archivo
  assertEquals(fotoDelColor(TECH, ["Azul Oscuro", "Gris Medio"], "Gris medio"), TECH[1]);
  assertEquals(fotoDelColor(SMOKING, ["Pizarra", "Azul Claro"], "pizarra"), SMOKING[0]); // por posición
  assertEquals(fotoDelColor(SMOKING, ["Pizarra", "Azul Claro"], "azul claro"), SMOKING[1]);
});

Deno.test("fotoDelColor sin color o sin coincidencia manda la primera (caso parecido)", () => {
  assertEquals(fotoDelColor(TECH, ["Azul Oscuro", "Gris Medio"], null), TECH[0]);
  assertEquals(fotoDelColor(TECH, ["Azul Oscuro", "Gris Medio"], "verde"), TECH[0]);
  assertEquals(fotoDelColor([TECH[0]], ["Azul Oscuro"], "gris"), TECH[0]);
});
