// Turnos › desbloquear un horario (0067). Sin {admin}: lo que puso el equipo lo borra cualquiera.
// Lo que puso la dueña, solo un admin — y eso lo frena la base (42501 'bloqueo_de_la_duena' → 403
// con su texto), no esta ruta: así vale igual para quien pegue directo a PostgREST. No toca ningún
// turno: bloquear nunca los tocó, así que desbloquear tampoco tiene nada que hacer con ellos.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import { borrarBloqueo } from '@/lib/queries/bloqueos';

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');

  try {
    const bloqueo = await borrarBloqueo(s, id);
    if (!bloqueo) return error(404, 'Ese horario ya no está bloqueado');
    return json({ bloqueo });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
