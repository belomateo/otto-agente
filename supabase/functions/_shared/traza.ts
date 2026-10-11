// La traza de un turno de Lucía: qué herramientas llamó y qué datos le devolvieron.
//
// Es la evidencia de lo que el modelo VIO en este turno. Las precondiciones de las
// herramientas de acción y las barandillas de contenido la leen para no creerle al modelo:
//   · agendar_turno solo acepta un hueco que esté en huecosOfrecidos (salió de buscar_horarios
//     en este mismo turno);
//   · precio_sin_herramienta solo acepta montos que estén en preciosDevueltos;
//   · horario_sin_herramienta solo acepta horas que estén en horasDevueltas;
//   · accesorio_sin_herramienta acepta, sin consultar_accesorios, los accesorios nombrados en un
//     texto de la casa que una herramienta devolvió en este turno (accesoriosDevueltos);
//   · promesa_sin_hacer (el auditor de promesas, 10/10) acepta «te agendé», «queda confirmado» o
//     «anoté tu mail» solo si la herramienta salió bien en este turno (llamadas) o si ya era verdad
//     en la base al empezar (turnosCliente, datosConocidos, linksPrevios).
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

// Un turno activo del cliente tal como lo ve Lucía en SUS TURNOS al empezar el turno (contexto.ts),
// ya en hora de Argentina. fecha "AAAA-MM-DD", hora "HH:MM", diaSemana 0 (domingo) a 6, dia del mes,
// enDias: cuántos días faltan desde hoy (0 hoy, 1 mañana). promesa_sin_hacer lo usa para no frenar
// lo que ya es verdad sin llamar a nada (10/10): «tu turno del martes ya está confirmado» cuando ya lo
// estaba, o «tu turno del miércoles a las 16:30 ya quedó reservado» cuando lo tiene.
export type TurnoDelCliente = {
  id: string;
  fecha: string;
  hora: string;
  diaSemana: number;
  dia: number;
  enDias: number;
  estado: string;
  confirmado: boolean;
};

export type Traza = {
  resumenTurnoEmitido?: boolean;
  // buscar_horarios vino vacío porque los días pedidos están en la reserva de urgencia y el
  // cliente no dio la fecha del evento (ver buscar_horarios.ts): derivar_a_persona exige
  // preguntarla antes de derivar por falta de lugar.
  reservaSinFechaEvento?: boolean;
  llamadas: LlamadaHerramienta[];
  huecosOfrecidos: HuecoOfrecido[];
  preciosDevueltos: number[];
  horasDevueltas: string[]; // "HH:MM"
  accesoriosDevueltos: string[]; // en singular y sin tilde: "zapato", "cinturon"
  rangosBuscados: RangoBuscado[];
  // Los tipos de link (web, web-venta, mapa, resena) que ya le llegaron al cliente ANTES de este
  // turno (turno.ts los saca del historial). enviar_link no los reenvía; venta_sin_resolver y
  // derivar_a_persona los cuentan como mandados, para no obligar a repetirlos (8/10).
  linksPrevios?: string[];
  // Auditor de promesas (10/10): lo que ya era verdad en la base al empezar el turno, sembrado por
  // turno.ts. turnosCliente son los turnos activos del cliente (los de SUS TURNOS, con si están
  // confirmados) y datosConocidos los campos de la ficha que ya tenían valor («email», «nombre»…).
  // Sin sembrar (pruebas, otra entrada) es como si no tuviera ni turnos ni datos.
  turnosCliente?: TurnoDelCliente[];
  datosConocidos?: string[];
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
