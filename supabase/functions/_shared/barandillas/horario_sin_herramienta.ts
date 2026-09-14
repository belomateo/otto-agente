// horario_sin_herramienta (contenido) — ningún día ni hora sale de memoria (regla 8). Cada hora
// que aparece en el texto tiene que haberla devuelto una herramienta en este turno
// (buscar_horarios, el horario de buscar_informacion o los turnos del cliente, que el turno
// siembra en la traza). Y ofrecer un día ("tengo lugar el jueves") sin buscar_horarios también
// salta. La pregunta de siempre, «¿te queda mejor a la mañana o a la tarde?», no es un horario.

import { llamoA } from "../traza.ts";
import { normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const dos = (n: number) => String(n).padStart(2, "0");
const hora = (h: string, m = "00") => `${dos(Number(h))}:${m}`;

export function horas(t: string): string[] {
  const n = normalizar(t);
  const res = new Set<string>();
  for (const x of n.matchAll(/(?<![\d.,])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d.,]*\d)/g)) res.add(hora(x[1], x[2]));
  for (const x of n.matchAll(/(?<![\d:.])([01]?\d|2[0-3])\s*(?:hs|h|horas)\b/g)) res.add(hora(x[1]));
  for (const x of n.matchAll(/\ba\s+las?\s+([01]?\d|2[0-3])\b(?!\s*[:.]\d)/g)) res.add(hora(x[1]));
  // "de 10 a 19": solo con horas de un día de trabajo, así "de 2 a 3 personas" no cuenta.
  for (const x of n.matchAll(/\bde\s+(0?[7-9]|1\d|2[0-3])\s+a\s+(0?[7-9]|1\d|2[0-3])\b(?!\s*[:.]\d)/g)) {
    res.add(hora(x[1]));
    res.add(hora(x[2]));
  }
  return [...res];
}

const OFRECE_DIA =
  /\b(tengo|tenemos|hay|te puedo dar|te ofrezco|disponible|libre|lugar)\b[^.?!\n]{0,40}\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|(?<!la )manana)\b/;

export const horarioSinHerramienta: Barandilla = {
  nombre: "horario_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza }) {
    const permitidas = new Set(traza.horasDevueltas.map((h) => h.trim().padStart(5, "0")));
    const fuera = horas(texto).filter((h) => !permitidas.has(h));
    if (fuera.length) {
      return {
        salta: true,
        accion: "rehacer",
        motivo: `una hora (${fuera.join(", ")}) que no devolvió ninguna herramienta en este turno: salen de buscar_horarios o buscar_informacion`,
      };
    }
    if (OFRECE_DIA.test(normalizar(texto)) && !llamoA(traza, "buscar_horarios")) {
      return { salta: true, accion: "rehacer", motivo: "ofrece un día sin haber llamado a buscar_horarios en este turno" };
    }
    return NO_SALTA;
  },
};
