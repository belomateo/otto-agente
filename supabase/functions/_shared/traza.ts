// La traza de un turno de Lucía: qué herramientas llamó y qué datos le devolvieron.
//
// Es la evidencia de lo que el modelo VIO en este turno. Las precondiciones de las
// herramientas de acción y las barandillas de contenido la leen para no creerle al modelo:
//   · agendar_turno solo acepta un hueco que esté en huecosOfrecidos (salió de buscar_horarios
//     en este mismo turno);
//   · precio_sin_herramienta solo acepta montos que estén en preciosDevueltos;
//   · horario_sin_herramienta solo acepta horas que estén en horasDevueltas.
// El turno (H1.7) arranca una traza nueva por turno y siembra horasDevueltas con los turnos
// del cliente que ya le pasa en el contexto.

import type { TipoTurno } from "./enums.ts";

export type LlamadaHerramienta = {
  herramienta: string;
  argumentos: unknown;
  ok: boolean;
  rechazo?: string;
  error?: string;
};

export type HuecoOfrecido = { inicio: string; fin: string; probador: number; tipo: TipoTurno };

export type Traza = {
  llamadas: LlamadaHerramienta[];
  huecosOfrecidos: HuecoOfrecido[];
  preciosDevueltos: number[];
  horasDevueltas: string[]; // "HH:MM"
};

export function trazaNueva(): Traza {
  return { llamadas: [], huecosOfrecidos: [], preciosDevueltos: [], horasDevueltas: [] };
}

export function llamoA(traza: Traza, herramienta: string, soloSiSalioBien = true): boolean {
  return traza.llamadas.some((l) => l.herramienta === herramienta && (!soloSiSalioBien || l.ok));
}
