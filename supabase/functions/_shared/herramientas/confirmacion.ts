// Lista del turno pedida por Mateo: datos guardados y una pregunta por nombre/correo
// faltantes. No exige completar la ficha para reservar ni depende de mapa/condiciones.

import type { Db } from "../db.ts";
import { fechaLarga, horaLocal } from "../tiempo.ts";

export type DatosResumenTurno = {
  nombre: string | null;
  telefono: string;
  email: string | null;
  inicio: Date;
  tz: string;
  actualizado?: boolean;
  // Lo que se guardó recién (nombre, email…). Con un turno ya completo y solo eso nuevo, el mensaje es corto.
  guardado?: string[];
};

export function resumenTurno(p: DatosResumenTurno): string {
  const linea = (v: string | null) => v?.replace(/\s+/g, " ").trim() || "No especificado";
  const faltantes = [!p.nombre?.trim() ? "nombre" : null, !p.email?.trim() ? "correo electrónico" : null].filter(Boolean);
  // 14/10 (Mateo): al mandar solo el correo no hace falta repetir toda la lista del turno que ya le llegó. Si dio el
  // nombre, la lista sí sale: así lo ve y puede corregirlo.
  if (p.actualizado && faltantes.length === 0 && p.guardado?.includes("email") && !p.guardado.includes("nombre")) {
    return "¡Listo, ya guardé tu correo! ¡Te esperamos!";
  }
  const cabeza = p.actualizado ? "¡Listo! Ya actualicé los datos de tu reserva:" : "¡Listo! Tu turno ya quedó agendado. Este es el resumen:";
  const lista = [
    `- Nombre: ${linea(p.nombre)}`,
    `- Número: ${linea(p.telefono)}`,
    `- Día y hora: ${fechaLarga(p.inicio, p.tz)} a las ${horaLocal(p.inicio, p.tz)} hs`,
    `- Gmail: ${linea(p.email)}`,
  ].join("\n");
  const cierre = faltantes.length
    ? `Para completar tus datos, ¿me decís tu ${faltantes.join(" y ")}?`
    : "¡Te esperamos!";
  return [cabeza, lista, cierre].join("\n\n");
}

export async function armarConfirmacion(
  _db: Db,
  p: DatosResumenTurno,
): Promise<{ texto: string; faltan: string[] }> {
  return { texto: resumenTurno(p), faltan: [] };
}
