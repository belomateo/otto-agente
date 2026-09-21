// Pide hablar con una persona, por palabra clave — código puro, mismo criterio que
// derivacion_dura.ts (CLAUDE.md § 2). Nace del pedido de Mateo, 21/9 (vía logica): "Lucía cuando
// deriva puede seguir contestando, a no ser que el cliente se enoje o quiera hablar directamente
// con un humano". Antes de esto, una charla ya derivada quedaba muda por completo — worker/
// atender.ts cortaba en seco apenas conv.estado no era 'activa' (0 de las dos condiciones que
// Mateo pidió se evaluaba: TODO quedaba callado, no solo enojo/pide-persona). Cuatro de cinco
// probadores lo encontraron como la causa #1 de sus fallas ("URGENTE necesito una respuesta
// ahora" y "necesito los horarios del local" — esta última Lucía la sabe contestar perfecto —
// quedaron sin respuesta).
//
// Esto NO reemplaza el criterio de "pide_persona" que ya decide el modelo (derivar_a_persona,
// motivo pide_persona) para arrancar UNA derivación nueva: esa charla sigue viva y el LLM la
// evalúa con contexto completo. Este detector es solo para la charla que YA ESTÁ derivada: ahí no
// tiene sentido correr el turno completo para decidir si Lucía se calla, así que un patrón
// rápido, en código, alcanza — igual que "reclamo"/"dañ*"/"corporativo" en derivacion_dura.ts.
//
// Deliberadamente angosto: un falso positivo acá vuelve a dejar a alguien sin respuesta (el
// problema que se está arreglando), así que solo dispara con un pedido EXPLÍCITO de hablar con
// una persona — no con cualquier mención de "persona" o "equipo" en la charla.

import { normalizar } from "../barandillas/texto.ts";

const PATRONES_PIDE_PERSONA: RegExp[] = [
  /hablar con (?:una persona|alguien|un humano|una humana|un operador|una operadora)\b/,
  /\b(?:quiero|necesito|prefiero) que me atienda (?:una persona|alguien)\b/,
  /pasame con (?:una persona|alguien)\b/,
  /\bno quiero hablar con (?:un bot|una maquina|un robot|una ia|un asistente virtual)\b/,
  /\bhabla(?:s|me|le) con (?:una persona|un humano)\b/,
];

export function pidePersonaPorPalabraClave(mensaje: string): boolean {
  const n = normalizar(mensaje);
  return PATRONES_PIDE_PERSONA.some((re) => re.test(n));
}
