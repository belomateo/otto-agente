// Ayudas de las pruebas de barandillas (hito 1.5). Todo en memoria: las barandillas trabajan
// sobre el texto de salida y la traza del turno, sin base y sin LLM.

import type { EntradaBarandilla } from "../../supabase/functions/_shared/barandillas/tipos.ts";
import { type Traza, trazaNueva } from "../../supabase/functions/_shared/traza.ts";

export const AHORA = new Date("2030-06-03T12:00:00-03:00");
export const HORA_MS = 60 * 60 * 1000;
const HACE_UN_MINUTO = new Date(AHORA.getTime() - 60 * 1000);

// Una traza con las herramientas que se llamaron bien y lo que devolvieron.
export function traza(p: { herramientas?: string[]; precios?: number[]; horas?: string[]; accesorios?: string[] } = {}): Traza {
  const t = trazaNueva();
  for (const h of p.herramientas ?? []) t.llamadas.push({ herramienta: h, argumentos: {}, ok: true });
  t.preciosDevueltos.push(...(p.precios ?? []));
  t.horasDevueltas.push(...(p.horas ?? []));
  t.accesoriosDevueltos.push(...(p.accesorios ?? []));
  return t;
}

export function entrada(texto: string, extra: Partial<EntradaBarandilla> = {}): EntradaBarandilla {
  return { texto, traza: trazaNueva(), ahora: AHORA, ultimoMensajeClienteAt: HACE_UN_MINUTO, esPrimerMensaje: false, ...extra };
}
