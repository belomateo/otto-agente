// La traza de un turno de Lucía: qué herramientas llamó y qué datos le devolvieron.
//
// Es la evidencia de lo que el modelo VIO en este turno. Las precondiciones de las
// herramientas de acción y las barandillas de contenido la leen para no creerle al modelo:
//   · agendar_turno solo acepta un hueco que esté en huecosOfrecidos (salió de buscar_horarios
//     en este mismo turno);
//   · precio_sin_herramienta solo acepta montos que estén en preciosDevueltos;
//   · horario_sin_herramienta solo acepta horas que estén en horasDevueltas;
//   · accesorio_sin_herramienta acepta, sin consultar_accesorios, los accesorios nombrados en un
//     texto de la casa que una herramienta devolvió en este turno (accesoriosDevueltos).
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

// Un rango que buscar_horarios efectivamente miró en este turno (desde/hasta ya recortados:
// `desde` nunca queda antes de hoy). Lo usa derivar_a_persona para motivo turno_urgente_sin_hueco
// (ver ahí): llamar a buscar_horarios no alcanza por sí solo, tiene que haber mirado hasta cerca
// de la fecha del evento — si no, "no hay hueco" solo dice que hoy no hay, no que no haya antes
// del evento (hallazgo en vivo, 1/10: Lucía buscó desde=hasta=hoy con el evento a 9 días y derivó
// igual, sin haber mirado ni un solo día más).
export type RangoBuscado = { desde: string; hasta: string };

export type Traza = {
  llamadas: LlamadaHerramienta[];
  huecosOfrecidos: HuecoOfrecido[];
  preciosDevueltos: number[];
  horasDevueltas: string[]; // "HH:MM"
  accesoriosDevueltos: string[]; // en singular y sin tilde: "zapato", "cinturon"
  rangosBuscados: RangoBuscado[];
};

export function trazaNueva(): Traza {
  return { llamadas: [], huecosOfrecidos: [], preciosDevueltos: [], horasDevueltas: [], accesoriosDevueltos: [], rangosBuscados: [] };
}

export function llamoA(traza: Traza, herramienta: string, soloSiSalioBien = true): boolean {
  return traza.llamadas.some((l) => l.herramienta === herramienta && (!soloSiSalioBien || l.ok));
}

// El `hasta` más lejano que se buscó en este turno, o null si no se buscó nada todavía.
export function hastaMasLejanoBuscado(traza: Traza): string | null {
  if (!traza.rangosBuscados.length) return null;
  return traza.rangosBuscados.reduce((max, r) => (r.hasta > max ? r.hasta : max), traza.rangosBuscados[0].hasta);
}
