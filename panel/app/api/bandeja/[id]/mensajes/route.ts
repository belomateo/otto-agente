// Bandeja › responder desde el panel (mostrador): POST { texto }. Escribe con la marca
// [mostrador] a través de mostrador_enviar (logica, 0028): 409 si la charla no está tomada
// ('derivada') o pasaron más de 24 hs desde el último mensaje del cliente, 400 si el texto
// queda vacío o pasa los 4000 caracteres, 404 si la charla no existe.
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
