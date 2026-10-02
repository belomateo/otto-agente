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
};

export function resumenTurno(p: DatosResumenTurno): string {
  const linea = (v: string | null) => v?.replace(/\s+/g, " ").trim() || "No especificado";
  const faltantes = [!p.nombre?.trim() ? "nombre" : null, !p.email?.trim() ? "correo electrónico" : null].filter(Boolean);
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
