// Control forma_y_tono (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que se lea como un WhatsApp de una persona: sin markdown, sin frases de relleno, una sola pregunta, largo justo y sin decir que es una IA.
// Junta: sin_markdown, sin_relleno, una_pregunta, largo, menciona_ia (en chequeos/, cada uno con su historia).

import { sinMarkdown } from "./chequeos/sin_markdown.ts";
import { sinRelleno } from "./chequeos/sin_relleno.ts";
import { unaPregunta } from "./chequeos/una_pregunta.ts";
import { largo } from "./chequeos/largo.ts";
import { mencionaIa } from "./chequeos/menciona_ia.ts";
import type { Control } from "./tipos.ts";

export const formaYTono: Control = {
  nombre: "forma_y_tono",
  descripcion: "Que se lea como un WhatsApp de una persona: sin markdown, sin frases de relleno, una sola pregunta, largo justo y sin decir que es una IA.",
  chequeos: [sinMarkdown, sinRelleno, unaPregunta, largo, mencionaIa],
};
