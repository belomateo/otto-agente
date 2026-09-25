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

// Sustantivos de la sección «accesorios» (AGENTE.md § 8), en singular y plural, cada uno con su
// forma base: "zapatos" en una ficha y "zapato" en la respuesta son el mismo dato. Es vocabulario
// chico y específico del rubro: no hace falta la sofisticación de no_a_secas para evitar falsos
// positivos.
const BASE: Record<string, string> = {
  zapato: "zapato",
  zapatos: "zapato",
  cinturon: "cinturon",
  cinturones: "cinturon",
  corbata: "corbata",
  corbatas: "corbata",
  camisa: "camisa",
  camisas: "camisa",
};
const ACCESORIOS = Object.keys(BASE);

export function mencionaAccesorio(texto: string): string | null {
  const n = normalizar(texto);
  return ACCESORIOS.find((a) => contieneFrase(n, a)) ?? null;
}

// Los accesorios que nombra un texto, en su forma base. Lo usan también las herramientas que
// devuelven textos de la casa (buscar_informacion, consultar_catalogo) para anotarlos en la traza.
export function accesoriosEn(texto: string): string[] {
  const n = normalizar(texto);
  return [...new Set(ACCESORIOS.filter((a) => contieneFrase(n, a)).map((a) => BASE[a]))];
}

// Hallazgo del 25/9, probando en vivo: la ficha «qué incluye» dice que la camisa, la corbata y
// los zapatos se alquilan aparte, y consultar_catalogo la devuelve con cada precio. Lucía la
// repetía, esto saltaba, y si en el reintento tampoco llamaba a consultar_accesorios la charla
// terminaba derivada a una persona por una pregunta de lo más normal ("¿tienen algo en azul?").
// Nombrar un accesorio que salió de un texto de la casa EN ESTE TURNO está respaldado: lo que se
// sigue frenando es nombrarlo de memoria.
export const accesorioSinHerramienta: Barandilla = {
  nombre: "accesorio_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza }) {
    if (llamoA(traza, "consultar_accesorios")) return NO_SALTA;
    const sinRespaldo = accesoriosEn(texto).filter((a) => !traza.accesoriosDevueltos.includes(a));
    if (sinRespaldo.length === 0) return NO_SALTA;
    return {
      salta: true,
      accion: "rehacer",
      motivo: `menciona un accesorio ("${sinRespaldo[0]}") sin haber llamado a consultar_accesorios en este turno`,
    };
  },
};
