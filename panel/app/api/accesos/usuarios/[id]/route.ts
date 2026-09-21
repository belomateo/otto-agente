// Sacar el acceso a alguien del equipo (H1.10, decisión de Mateo 16/9): DELETE con el id del
// PERFIL (no el de una solicitud — el que trae solicitudes_acceso.perfil_id, o
// GET /api/accesos?estado=aprobada). Solo admin; nadie puede tocar su propio perfil (la base
// lo frena con 42501).
//
// PATCH { rol }: subir de categoría (0059, decisión de Mateo 21/9) a alguien ya aprobado. Solo
// admin; cambiar_rol() es security definer, re-verifica es_admin() adentro, y sigue pasando por
// trg_sin_autoedicion (0018) — nadie se sube el rol a sí mismo.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, leerCuerpo } from '@/lib/api/validar';
import { cambiarRol, quitarAcceso } from '@/lib/queries/accesos';

const esquemaCambiarRol = z.strictObject({ rol: z.enum(['admin', 'equipo']) });

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

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const cuerpo = await leerCuerpo(request, esquemaCambiarRol);
  if (cuerpo instanceof Response) return cuerpo;

  const { data, error: e } = await cambiarRol(s, id, cuerpo.rol);
  if (e) return desdeErrorDeBase(e);
  return json({ perfil: data });
}
