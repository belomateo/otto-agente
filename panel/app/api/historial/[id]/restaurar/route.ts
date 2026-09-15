// "Volver a la versión anterior" (H1.9, control 3): POST con { version } = la versión que el
// panel tiene en pantalla. La restauración deja, a su vez, su propia fila de historial.
import { requerirSesion } from '@/lib/api/sesion';
import { restaurar } from '@/lib/edicion/editar';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return restaurar(s, id, request);
}
