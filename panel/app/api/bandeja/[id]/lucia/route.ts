// Botón on/off de Lucía por charla (Mateo, 30/9): PATCH con { activa: boolean }.
// El worker lee lucia_activa antes de procesar cada mensaje (0070).
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const body = await request.json().catch(() => null);
  if (typeof body?.activa !== 'boolean') return error(400, 'Se esperaba { activa: boolean }');
  const { error: e } = await s.supabase
    .from('conversaciones')
    .update({ lucia_activa: body.activa })
    .eq('id', id);
  if (e) return desdeErrorDeBase(e);
  return json({ lucia_activa: body.activa });
}
