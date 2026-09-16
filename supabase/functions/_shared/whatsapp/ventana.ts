// La ventana de 24 hs de WhatsApp: Meta deja mandar texto libre solo si el cliente escribió en
// las últimas 24 hs. Fuera de esa ventana, solo plantillas aprobadas (hito 1.14, control 5).
// Se chequea en código antes de cada texto libre; las plantillas no pasan por acá.

export const VENTANA_MS = 24 * 60 * 60 * 1000;

export function puedeTextoLibre(ultimoMensajeDelCliente: Date | null, ahora: Date): boolean {
  if (ultimoMensajeDelCliente === null || Number.isNaN(ultimoMensajeDelCliente.getTime())) return false;
  const pasado = ahora.getTime() - ultimoMensajeDelCliente.getTime();
  return pasado >= 0 && pasado < VENTANA_MS;
}
