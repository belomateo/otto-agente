// Revocar una invitación sin usar (H1.10, decisión de Mateo 17/9). El email va en la URL: la
// tabla no tiene otro id (email es la clave primaria, 0053). Solo admin.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { revocarInvitacion } from '@/lib/queries/accesos';

export async function DELETE(request: Request, ctx: { params: Promise<{ email: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { email } = await ctx.params;
  const { data, error: e } = await revocarInvitacion(s, decodeURIComponent(email));
  if (e) return desdeErrorDeBase(e);
  if (!data) return error(404, 'No existe esa invitación (o ya se usó)');
  return json({ invitacion: data });
}
