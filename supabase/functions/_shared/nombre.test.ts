import { assertEquals } from "jsr:@std/assert@1.0.13";
import { nombreUsable } from "./nombre.ts";

Deno.test("nombreUsable: deja los nombres y descarta frases, usuarios y símbolos de perfil", () => {
  for (const [crudo, esperado] of [
    ["Larisa Hueso", "Larisa Hueso"],
    ["Nicolás", "Nicolás"],
    ["mateo veron", "Mateo Veron"],
    ["lauraaaa", "Laura"],
    ["PEDRO", "Pedro"],
    ["JP", "JP"],
    ["Aaron", "Aaron"],
    ["McLovin", "McLovin"],
    ["amorrrr", null],
    ["María de los Ángeles", "María de los Ángeles"],
    ["Solci🩷", "Solci"],
    ["🌺 Sole 🌺", "Sole"],
    ["Juan 10", "Juan"],
    ["siempre te elijo", null],
    ["pichigodoy916", null],
    [".", null],
    ["C.", null],
    ["🤍♥️🤍", null],
    ["", null],
    [null, null],
  ] as const) assertEquals(nombreUsable(crudo), esperado, String(crudo));
});
