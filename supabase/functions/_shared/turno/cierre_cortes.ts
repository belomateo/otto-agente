import { normalizar } from "../barandillas/texto.ts";
// Solo cierres inequívocos. «Sí», «dale» y «confirmo» pueden confirmar un turno.
export function esCierreCortes(texto: string, ultimoMensajeNuestro = ""): boolean {
  if (/[?¿]/.test(texto)) return false;
  const n = normalizar(texto).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  // Un «ok» puede estar aceptando el horario que acabamos de ofrecer.
  if (/^(?:ok|okay)$/.test(n) && /[?¿]|\b(?:ofrec\w*|agend\w*|reserv\w*|horario|turno|confirm\w*)\b/.test(normalizar(ultimoMensajeNuestro))) return false;
  return /^(?:(?:ok|okay|bueno|perfecto)\s+)?(?:(?:muchas|muchisimas|mil)\s+)?gracias(?:\s+por\s+(?:(?:tu|su|la)\s+)?(?:atencion|ayuda|informacion|todo))?(?:\s+(?:lucia|chau|hasta luego))?$/.test(n) || /^(?:ok|okay|chau|hasta luego)$/.test(n);
}
