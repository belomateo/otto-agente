// Bandeja › responder desde el panel (mostrador): POST { texto }. Escribe con la marca
// [mostrador] a través de mostrador_enviar (logica); 409 si la charla no está tomada
// ('derivada'), 503 si la función todavía no existe en la base.
import { leerCuerpo } from '@/lib/api/validar';
import { requerirSesion } from '@/lib/api/sesion';
import { enviarMostrador, ESQUEMA_MOSTRADOR } from '@/lib/edicion/mostrador';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const cuerpo = await leerCuerpo(request, ESQUEMA_MOSTRADOR);
  if (cuerpo instanceof Response) return cuerpo;
  return enviarMostrador(s, id, cuerpo.texto);
}
