// Los textos del seguimiento de 23 horas (Mateo, 3/11). Claude no escribe el mensaje: solo decide si
// hay interés y en qué punto quedó la charla. El texto sale de contexto_agente (editable desde
// Configuración), así no puede inventar horarios que Lucía nunca ofreció (caso de la prueba del 3/11:
// «¿pudiste ver los horarios que te propuse?» a un cliente al que nadie le había propuesto horarios).

import { primerNombre } from "../whatsapp/plantillas.ts";

export type EtapaSeguimiento = "sin_fecha" | "con_fecha" | "horarios" | "consulta";

export const CLAVE_TEXTO_SEGUIMIENTO: Record<EtapaSeguimiento, string> = {
  sin_fecha: "texto_seguimiento_sin_fecha",
  con_fecha: "texto_seguimiento_con_fecha",
  horarios: "texto_seguimiento_horarios",
  consulta: "texto_seguimiento_consulta",
};

// Los mismos de la migración 0111; solo se usan si la fila de contexto_agente quedó vacía.
export const TEXTO_RESPALDO: Record<EtapaSeguimiento, string> = {
  sin_fecha: "Hola {nombre}! Quedó pendiente saber para qué fecha necesitás el traje, así te busco el mejor horario para venir a probártelo. Me contás? 😊",
  con_fecha: "Hola {nombre}! Te busco un turno para venir a probarte? Decime qué días te quedan cómodos y lo coordinamos.",
  horarios: "Hola {nombre}! Te sirvió alguno de los horarios que te pasé? Si ninguno te viene bien, decime qué días te quedan cómodos y lo vemos.",
  consulta: "Hola {nombre}! Pudiste pensarlo? Si te quedó alguna duda, contame y te ayudo. 😊",
};

// Lo que sabe la base pesa más que lo que dice el modelo: «horarios» solo si Lucía de verdad buscó
// horarios en esa charla; «sin fecha» solo si ni la ficha ni el cliente dieron la fecha o el mes.
export function etapaDelSeguimiento(
  d: { vaAConsultar: boolean; dioFechaOMes: boolean },
  hechos: { buscoHorarios: boolean; tieneFecha: boolean },
): EtapaSeguimiento {
  if (d.vaAConsultar) return "consulta";
  if (hechos.buscoHorarios) return "horarios";
  if (hechos.tieneFecha || d.dioFechaOMes) return "con_fecha";
  return "sin_fecha";
}

// «Hola {nombre}! …» → «Hola Nico! …»; sin nombre, «Hola! …».
export function textoDelSeguimiento(plantilla: string, nombre: string | null): string {
  const n = primerNombre(nombre);
  return plantilla.replace(/\s*\{nombre\}/g, n ? ` ${n}` : "").trim();
}
