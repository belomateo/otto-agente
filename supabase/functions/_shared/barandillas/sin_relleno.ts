// sin_relleno (formato) — nada de cierres de relleno (AGENTE.md § 1 y § 6). Si el mensaje
// termina con una de estas fórmulas, se corta esa frase en código y el resto sale. Una fórmula
// en el medio del mensaje no se toca: la regla es sobre cómo termina. La lista incluye todas
// las que prohíbe el prompt (tests/barandillas/consistencia.test.ts lo verifica).

import { contieneFrase, normalizar, oraciones, rearmar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

export const FORMULAS_DE_RELLENO = [
  "cualquier duda consultame",
  "cualquier duda consultanos",
  "cualquier cosa avisame",
  "cualquier cosa me avisas",
  "quedo atenta",
  "quedo atento",
  "estoy para ayudarte",
  "quedo a disposicion",
  "quedo a tu disposicion",
  "quedo a su disposicion",
  "aguardo su respuesta",
  "aguardo tu respuesta",
  "estimada",
  "estimado",
  "cordialmente",
  "no dudes en consultarnos",
  "no dudes en consultar",
  "saludos cordiales",
];

const esRelleno = (oracion: string) => {
  const n = normalizar(oracion);
  return FORMULAS_DE_RELLENO.find((f) => contieneFrase(n, f)) ?? null;
};

export const sinRelleno: Barandilla = {
  nombre: "sin_relleno",
  etapa: "formato",
  accion: "cortar",
  evaluar({ texto }) {
    const os = oraciones(texto);
    const cortadas: string[] = [];
    while (os.length) {
      const f = esRelleno(os[os.length - 1].texto);
      if (!f) break;
      cortadas.unshift(f);
      os.pop();
    }
    if (cortadas.length === 0) return NO_SALTA;
    return {
      salta: true,
      accion: "cortar",
      motivo: `cierre de relleno («${cortadas.join("», «")}»): se cortó`,
      texto: rearmar(os),
    };
  },
};
