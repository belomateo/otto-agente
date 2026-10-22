// Bandeja › mandar un audio grabado en el navegador (pedido de Sofía, 22/10): POST multipart,
// campo `archivo`. Mismas reglas que la foto (mostrador_enviar_audio, 0109): 409 si la charla
// no está tomada o pasaron más de 24 hs, 400 si no es un tipo que acepte WhatsApp o pasa 16 MB.
import { requerirSesion } from '@/lib/api/sesion';
import { enviarAudioMostrador } from '@/lib/edicion/mostrador-audio';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return enviarAudioMostrador(s, id, request);
}
