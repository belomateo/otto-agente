import { normalizar } from "../barandillas/texto.ts";

// Un mensaje hecho SOLO de palabras de cierre o de asentimiento («A listo», «Ok gracias, saludos»,
// «Dale»): no pregunta nada ni trae un dato. Más amplio que esCierreCortes (que deja pasar «dale»
// porque puede estar confirmando un turno): sirve para saber que no falta ningún dato, no para
// callarse. Si trae cualquier otra palabra («Dale, el martes a las 15»), no lo es.
const CIERRE_O_ASENTIMIENTO = new Set([
  "a", "ah", "aa", "ahh", "ok", "okay", "okey", "oki", "dale", "bueno", "buenisimo", "buenisima", "perfecto", "perfecta",
  "listo", "lista", "genial", "joya", "barbaro", "excelente", "bien", "claro", "clara", "entendido", "entiendo", "si",
  "gracias", "muchas", "muchisimas", "mil", "por", "la", "info", "informacion", "atencion", "ayuda", "todo", "tu", "su",
  "x", "saludos", "chau", "chao", "hasta", "luego", "pronto", "nos", "vemos", "igualmente", "de", "acuerdo", "muy",
  "amable", "buen", "buena", "buenas", "dia", "tarde", "noche", "besos", "beso", "abrazo", "slds", "lucia",
]);
export function esSoloCierreOAsentimiento(texto: string): boolean {
  if (/[?¿]/.test(texto)) return false;
  const n = normalizar(texto).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!n || n.length > 80) return false;
  return n.split(" ").every((p) => CIERRE_O_ASENTIMIENTO.has(p));
}

// Solo cierres inequívocos. «Sí», «dale» y «confirmo» pueden confirmar un turno.
export function esCierreCortes(texto: string, ultimoMensajeNuestro = ""): boolean {
  if (/[?¿]/.test(texto)) return false;
  const n = normalizar(texto).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  // Un «ok» puede estar aceptando el horario que acabamos de ofrecer.
  if (/^(?:ok|okay)$/.test(n) && /[?¿]|\b(?:ofrec\w*|agend\w*|reserv\w*|horario|turno|confirm\w*)\b/.test(normalizar(ultimoMensajeNuestro))) return false;
  return /^(?:(?:ok|okay|bueno|perfecto)\s+)?(?:(?:muchas|muchisimas|mil)\s+)?gracias(?:\s+por\s+(?:(?:tu|su|la)\s+)?(?:atencion|ayuda|informacion|todo))?(?:\s+(?:lucia|chau|hasta luego))?$/.test(n) || /^(?:ok|okay|chau|hasta luego)$/.test(n);
}
