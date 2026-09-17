// Bandeja › mandar una foto desde el mostrador (decisión de Mateo, 16/9): POST multipart/
// form-data, campo `archivo` (y opcional `epigrafe`). Mismas reglas que responder con texto
// (mostrador_enviar_foto, logica): 409 si la charla no está tomada o pasaron más de 24 hs
// (detalle.motivo), 400 si la foto no es JPG/PNG/WebP o pasa los 5 MB, 404 si la charla no
// existe.
import { requerirSesion } from '@/lib/api/sesion';
import { enviarFotoMostrador } from '@/lib/edicion/mostrador-foto';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return enviarFotoMostrador(s, id, request);
}
