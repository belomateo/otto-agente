// Retomar una charla cerrada (Mateo, #6): la pasa a 'derivada' para que el mostrador
// pueda escribirle al cliente. A diferencia de atencion_resolver('tomar'), este endpoint
// actúa solo cuando el estado ES 'cerrada' — si ya está activa o derivada, no hace nada.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const { data, error: e } = await s.supabase
    .from('conversaciones')
    .update({ estado: 'derivada' })
    .eq('id', id)
    .eq('estado', 'cerrada')
    .select('id, estado')
    .maybeSingle();
  if (e) return desdeErrorDeBase(e);
  if (!data) return json({ ya_estaba: true });
  return json({ estado: data.estado });
}
