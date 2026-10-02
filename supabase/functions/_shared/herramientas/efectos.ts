import type { Efectos } from "./tipos.ts";

// Si se agenda y se completa la ficha en el mismo intercambio, solo sale la
// última lista de esa reserva. Los mensajes de otras herramientas se conservan.
export function mensajesDeEfectos(efectos: readonly Efectos[]): string[] {
  return efectos.flatMap((e, i) => {
    if (e.resumenTurnoId && efectos.slice(i + 1).some((otro) => otro.resumenTurnoId === e.resumenTurnoId)) return [];
    return e.mensajesAlCliente ?? [];
  });
}
