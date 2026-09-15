// Aviso de turno (H1.16, decisión #10): POST /api/turnos/<id>/ok, sin cuerpo. El OK del cartel,
// para cualquier usuario aprobado. 200 { ya_estaba, confirmo, turno }; 409 si el turno no está en
// la ventana del aviso (todavía no, ya terminó, cancelado o no-vino); 404 si no existe.
import { requerirSesion } from '@/lib/api/sesion';
import { darOkAviso } from '@/lib/edicion/aviso-turno';

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return darOkAviso(s, id);
}
