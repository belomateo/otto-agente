// Cuándo sale el seguimiento de 23 horas (Mateo, 3/11): a las 23 hs del último mensaje del cliente,
// que es cuando todavía se puede escribir texto libre (Meta cierra la ventana a las 24 hs). El
// horario de envío es el de siempre, de 9 a 21: si las 23 hs caen de noche, sale en el primer
// momento de la mañana que todavía entre en la ventana o, si no entra ninguno, la última tarde
// antes de las 21. El cron corre cada 15 minutos, así que los momentos se mueven en pasos de 15.

import { MS_POR_MINUTO, minutosDelDia } from "../tiempo.ts";

const HORA_MS = 60 * MS_POR_MINUTO;
export const MARCA_MS = 23 * HORA_MS;
export const VENTANA_MS = 24 * HORA_MS;
// Por si Meta cierra la ventana unos minutos antes de lo que cuenta nuestro reloj.
export const MARGEN_MS = 5 * MS_POR_MINUTO;
const PASO_MS = 15 * MS_POR_MINUTO;
const DESDE_MIN = 9 * 60;
const ULTIMA_CORRIDA_MIN = 20 * 60 + 45; // la última del cron antes de las 21

const entraEnLaGrilla = (t: number, tz: string) => {
  const m = minutosDelDia(new Date(t), tz);
  return m >= DESDE_MIN && m <= ULTIMA_CORRIDA_MIN;
};

export function momentoDelSeguimiento(ultimoCliente: Date, tz: string): Date {
  const marca = ultimoCliente.getTime() + MARCA_MS;
  const limite = ultimoCliente.getTime() + VENTANA_MS - MARGEN_MS;
  // Si la marca cae antes de la corrida de las 20:45, esa corrida todavía la agarra.
  if (minutosDelDia(new Date(marca), tz) >= DESDE_MIN && minutosDelDia(new Date(marca), tz) < ULTIMA_CORRIDA_MIN) return new Date(marca);
  for (let t = Math.ceil(marca / PASO_MS) * PASO_MS; t < limite; t += PASO_MS) {
    if (entraEnLaGrilla(t, tz)) return new Date(t);
  }
  for (let t = Math.floor(marca / PASO_MS) * PASO_MS; t > marca - 24 * HORA_MS; t -= PASO_MS) {
    if (entraEnLaGrilla(t, tz)) return new Date(t);
  }
  return new Date(marca); // no pasa: en 24 horas siempre hay un momento de 9 a 21
}

// ¿Le toca ahora? Desde su momento, antes de que cierre la ventana, y en el horario de 9 a 21.
export function tocaElSeguimiento(ultimoCliente: Date, ahora: Date, tz: string): boolean {
  const desde = momentoDelSeguimiento(ultimoCliente, tz).getTime();
  const hasta = ultimoCliente.getTime() + VENTANA_MS - MARGEN_MS;
  const m = minutosDelDia(ahora, tz);
  return ahora.getTime() >= desde && ahora.getTime() < hasta && m >= DESDE_MIN && m < 21 * 60;
}
