// Control dato_sin_consultar (9/10, pedido de Mateo: 7 controles en vez de 16 barandillas sueltas).
// Que no diga un precio, un horario ni un accesorio que no le haya dado una herramienta.
// Junta: precio_sin_herramienta, horario_sin_herramienta, accesorio_sin_herramienta (en chequeos/, cada uno con su historia).

import { precioSinHerramienta } from "./chequeos/precio_sin_herramienta.ts";
import { horarioSinHerramienta } from "./chequeos/horario_sin_herramienta.ts";
import { accesorioSinHerramienta } from "./chequeos/accesorio_sin_herramienta.ts";
import type { Control } from "./tipos.ts";

export const datoSinConsultar: Control = {
  nombre: "dato_sin_consultar",
  descripcion: "Que no diga un precio, un horario ni un accesorio que no le haya dado una herramienta.",
  chequeos: [precioSinHerramienta, horarioSinHerramienta, accesorioSinHerramienta],
};
