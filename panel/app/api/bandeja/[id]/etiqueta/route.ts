// Etiquetas manuales por charla (Mateo, 30/9): PATCH con { agregar?: string } o { quitar?: string }.
// Las etiquetas se guardan en conversaciones.etiquetas (text[], 0070).
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const body = await request.json().catch(() => null);
  const { agregar, quitar } = (body ?? {}) as { agregar?: string; quitar?: string };
  if (!agregar && !quitar) return error(400, 'Se esperaba { agregar } o { quitar }');

  const { data: conv, error: getErr } = await s.supabase
    .from('conversaciones')
    .select('etiquetas')
    .eq('id', id)
    .maybeSingle();
  if (getErr) return desdeErrorDeBase(getErr);
  if (!conv) return error(404, 'Esa charla no existe');

  let etiquetas = (conv.etiquetas as string[]) ?? [];
  if (agregar && !etiquetas.includes(agregar.trim())) etiquetas = [...etiquetas, agregar.trim()];
  if (quitar) etiquetas = etiquetas.filter((e) => e !== quitar);

  const { error: updErr } = await s.supabase
    .from('conversaciones')
    .update({ etiquetas })
    .eq('id', id);
  if (updErr) return desdeErrorDeBase(updErr);
  return json({ etiquetas });
}
