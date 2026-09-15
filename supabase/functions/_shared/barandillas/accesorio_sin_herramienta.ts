// accesorio_sin_herramienta (contenido) — nunca confirmás que se alquila o vende un accesorio
// sin haberlo chequeado con consultar_accesorios en este turno (AGENTE.md § 4: la herramienta
// pasó a OBLIGATORIA el 14/9, después de que Lucía contestara "sí, alquilamos zapatos" de
// memoria en la prueba real).
//
// Hallazgo del 15/9, al bajar LLM_PRINCIPAL a un modelo más chico y económico (gpt-5.6-luna,
// decisión de Mateo): un modelo más barato sigue peor una instrucción de prompt como
// "OBLIGATORIA" — el mismo caso volvió a pasar. Es la prueba en código de por qué las reglas
// deterministas (CLAUDE.md § 2) importan MÁS, no menos, cuanto más económico es el modelo: acá
// no alcanza con pedírselo mejor, hay que impedirlo en código, igual que con precios y horarios.
//
// Nombres de accesorios, no precios: por eso es una barandilla propia y no una variante de
// precio_sin_herramienta (que mira montos) ni de horario_sin_herramienta (que mira horas).

import { llamoA } from "../traza.ts";
import { contieneFrase, normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

// Sustantivos de la sección «accesorios» (AGENTE.md § 8), en singular y plural. Es vocabulario
// chico y específico del rubro: no hace falta la sofisticación de no_a_secas para evitar falsos
// positivos.
const ACCESORIOS = ["zapato", "zapatos", "cinturon", "cinturones", "corbata", "corbatas", "camisa", "camisas"];

export function mencionaAccesorio(texto: string): string | null {
  const n = normalizar(texto);
  return ACCESORIOS.find((a) => contieneFrase(n, a)) ?? null;
}

export const accesorioSinHerramienta: Barandilla = {
  nombre: "accesorio_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza }) {
    const hallado = mencionaAccesorio(texto);
    if (!hallado || llamoA(traza, "consultar_accesorios")) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: `menciona un accesorio ("${hallado}") sin haber llamado a consultar_accesorios en este turno`,
    };
  },
};
