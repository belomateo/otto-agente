// largo (formato) — mensajes cortos, en burbujas (AGENTE.md § 1 y § 6). Un bloque de más de
// 600 caracteres sin una línea en blanco se rehace pidiendo que lo parta.

import { type Barandilla, NO_SALTA } from "./tipos.ts";

export const MAXIMO_POR_BLOQUE = 600;

export const largo: Barandilla = {
  nombre: "largo",
  etapa: "formato",
  accion: "rehacer",
  evaluar({ texto }) {
    const bloque = String(texto ?? "").split(/\n\s*\n/).map((b) => b.trim()).find((b) => b.length > MAXIMO_POR_BLOQUE);
    if (!bloque) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: `un bloque de ${bloque.length} caracteres sin cortes: partilo en dos o tres párrafos cortos separados por una línea en blanco`,
    };
  },
};
