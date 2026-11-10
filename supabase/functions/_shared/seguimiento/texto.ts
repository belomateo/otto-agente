// Los textos del seguimiento de 23 horas (Mateo, 3/11). Claude no escribe el mensaje: solo decide si
// hay interés y en qué punto quedó la charla. El texto sale de contexto_agente (editable desde
// Configuración), así no puede inventar horarios que Lucía nunca ofreció (caso de la prueba del 3/11:
// «¿pudiste ver los horarios que te propuse?» a un cliente al que nadie le había propuesto horarios).

import { fechaLarga, fechaLocal, instanteLocal } from "../tiempo.ts";
import { primerNombre } from "../whatsapp/plantillas.ts";

export type EtapaSeguimiento = "sin_fecha" | "con_fecha" | "horarios" | "consulta";

export const CLAVE_TEXTO_SEGUIMIENTO: Record<EtapaSeguimiento, string> = {
  sin_fecha: "texto_seguimiento_sin_fecha",
  con_fecha: "texto_seguimiento_con_fecha",
  horarios: "texto_seguimiento_horarios",
  consulta: "texto_seguimiento_consulta",
};

// Los mismos de la migración 0114; solo se usan si la fila de contexto_agente quedó vacía.
export const TEXTO_RESPALDO: Record<EtapaSeguimiento, string> = {
  sin_fecha: "Hola {nombre}! Para dejarte reservado un horario me falta saber para qué fecha necesitás el traje. Me contás? 😊",
  con_fecha: "Hola {nombre}! {evento} Todavía no tenés la visita reservada: decime qué días te quedan cómodos, a la mañana o a la tarde, y te busco el horario.",
  horarios: "Hola {nombre}! Te sirvió alguno de los horarios que te pasé? {evento} Si ninguno te viene bien, decime qué días te quedan cómodos, a la mañana o a la tarde, y te busco otros.",
  consulta: "Hola {nombre}! Pudiste pensarlo? {evento} Si te quedó alguna duda, contame y te ayudo. 😊",
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

// «Tu evento es el sábado 12 de diciembre.» con la fecha de la ficha (AAAA-MM-DD); null si no hay o ya pasó.
export function fraseDelEvento(fechaYmd: string | null, ahora: Date, tz: string): string | null {
  if (!fechaYmd || fechaYmd < fechaLocal(ahora, tz)) return null;
  return `Tu evento es el ${fechaLarga(instanteLocal(fechaYmd, "12:00", tz), tz)}.`;
}

// «Hola {nombre}! {evento} …» → «Hola Nico! Tu evento es el … …»; sin nombre, «Hola! …»; sin evento, se saca.
export function textoDelSeguimiento(plantilla: string, nombre: string | null, evento: string | null = null): string {
  const n = primerNombre(nombre);
  return plantilla
    .replace(/\s*\{nombre\}/g, n ? ` ${n}` : "")
    .replace(/\s*\{evento\}/g, evento ? ` ${evento}` : "")
    .replace(/ {2,}/g, " ")
    .trim();
}
