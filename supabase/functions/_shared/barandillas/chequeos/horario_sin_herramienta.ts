// horario_sin_herramienta (contenido) — ningún día ni hora sale de memoria (regla 8). Cada hora
// que aparece en el texto tiene que haberla devuelto una herramienta en este turno
// (buscar_horarios, el horario de buscar_informacion o los turnos del cliente, que el turno
// siembra en la traza). Y ofrecer un día ("tengo lugar el jueves") sin buscar_horarios también
// salta. La pregunta de siempre, «¿te queda mejor a la mañana o a la tarde?», no es un horario.
//
// Hallazgo de Mateo, 16/9: una hora en palabras ("a las tres de la tarde") pasaba sin control —
// solo se leían dígitos. PALABRA_A_NUMERO cubre la una a las doce; "de la tarde"/"de la noche"
// suma 12 (de la mañana no cambia nada), igual que se leería con el reloj de 24 hs.

import { llamoA } from "../../traza.ts";
import { normalizar } from "../texto.ts";
import { type Barandilla, NO_SALTA } from "../tipos.ts";

const dos = (n: number) => String(n).padStart(2, "0");
const hora = (h: string | number, m = "00") => `${dos(Number(h))}:${m}`;

const PALABRA_A_NUMERO: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};
const HORAS_EN_PALABRAS = Object.keys(PALABRA_A_NUMERO).join("|");

export function horas(t: string): string[] {
  const n = normalizar(t);
  const res = new Set<string>();
  for (const x of n.matchAll(/(?<![\d.,])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d.,]*\d)/g)) res.add(hora(x[1], x[2]));
  for (const x of n.matchAll(/(?<![\d:.])([01]?\d|2[0-3])\s*(?:hs|h|horas)\b/g)) res.add(hora(x[1]));
  // «a las 14 y 45» es las 14:45, no las 14:00 (Claudia, 17/10).
  for (const x of n.matchAll(/\ba\s+las?\s+([01]?\d|2[0-3])\b(?!\s*[:.]\d|\s+y\s+(?:30|45)\b)/g)) res.add(hora(x[1]));
  for (const x of n.matchAll(new RegExp(`\\ba\\s+las?\\s+(${HORAS_EN_PALABRAS})\\b(?:\\s+de\\s+la\\s+(manana|tarde|noche))?`, "g"))) {
    let h = PALABRA_A_NUMERO[x[1]];
    if ((x[2] === "tarde" || x[2] === "noche") && h < 12) h += 12;
    res.add(hora(h));
  }
  // "de 10 a 19": solo con horas de un día de trabajo, así "de 2 a 3 personas" no cuenta.
  for (const x of n.matchAll(/\bde\s+(0?[7-9]|1\d|2[0-3])\s+a\s+(0?[7-9]|1\d|2[0-3])\b(?!\s*[:.]\d)/g)) {
    res.add(hora(x[1]));
    res.add(hora(x[2]));
  }
  return [...res];
}

const OFRECE_DIA =
  /\b(tengo|tenemos|hay|te puedo dar|te ofrezco|disponible|libre|lugar)\b[^.?!\n]{0,40}\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|(?<!la )manana)\b/;

// Segundo intento con una hora sin respaldo (prueba del 11/10): el cliente contestó «11» a una
// oferta de 10:00 o 13:00, Lucía le preguntó por las 11:00 sin buscarla dos veces y la charla
// terminó en el equipo con el texto genérico. Ahora, como el precio (D13): se saca la oración con
// esa hora y sale el resto; si no queda nada, una pregunta neutra para seguir, sin pasar la charla.
const PREGUNTA_NEUTRA = "Me decís qué día te queda mejor, así lo reviso en la agenda?";
function sinLasHoras(texto: string, fuera: string[]): string {
  const linea = (l: string) => l.split(/(?<=[.!?…])\s+/).filter((o) => !horas(o).some((h) => fuera.includes(h))).join(" ").trim();
  const resultado = texto.split(/(\n+)/).map((b) => (/^\n+$/.test(b) ? b : linea(b))).join("")
    .replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  return (resultado.match(/\p{L}/gu) ?? []).length < 15 ? PREGUNTA_NEUTRA : resultado;
}

export const horarioSinHerramienta: Barandilla = {
  nombre: "horario_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza, saltosPrevios }) {
    const permitidas = new Set(traza.horasDevueltas.map((h) => h.trim().padStart(5, "0")));
    const fuera = horas(texto).filter((h) => !permitidas.has(h));
    if (fuera.length) {
      const motivo = `una hora (${fuera.join(", ")}) que no devolvió ninguna herramienta en este turno: salen de buscar_horarios o buscar_informacion. ` +
        "Si el cliente la pidió, llamá a buscar_horarios con fecha_hora (ese día y esa hora) para ver si está libre antes de nombrarla; " +
        "si no sabés de qué día habla, preguntale el día sin nombrar la hora";
      if (saltosPrevios) {
        return { salta: true, accion: "cortar", motivo: `${motivo} (segundo intento: se sacó en código la oración)`, texto: sinLasHoras(texto, fuera) };
      }
      return { salta: true, accion: "rehacer", motivo };
    }
    if (OFRECE_DIA.test(normalizar(texto)) && !llamoA(traza, "buscar_horarios")) {
      return { salta: true, accion: "rehacer", motivo: "ofrece un día sin haber llamado a buscar_horarios en este turno" };
    }
    return NO_SALTA;
  },
};
