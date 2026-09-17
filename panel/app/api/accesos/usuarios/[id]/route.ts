// Sacar el acceso a alguien del equipo (H1.10, decisión de Mateo 16/9): DELETE con el id del
// PERFIL (no el de una solicitud — el que trae solicitudes_acceso.perfil_id, o
// GET /api/accesos?estado=aprobada). Solo admin; nadie puede tocar su propio perfil (la base
// lo frena con 42501).
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import { quitarAcceso } from '@/lib/queries/accesos';

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const { data, error: e } = await quitarAcceso(s, id);
  if (e) return desdeErrorDeBase(e);
  if (!data) return error(404, 'Ese usuario no existe');
  return json({ perfil: data });
}
