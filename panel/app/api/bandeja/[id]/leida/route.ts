import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { leerCuerpo } from '@/lib/api/validar';
import { error, json } from '@/lib/api/respuestas';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return error(400, 'Conversación inválida');
  const cuerpo = await leerCuerpo(request, z.object({ mensajes: z.array(z.uuid()).max(500) }));
  if (cuerpo instanceof Response) return cuerpo;
  const r = await s.supabase.rpc('bandeja_marcar_leida', { p_conversacion: id, p_mensajes: cuerpo.mensajes });
  if (r.error) return error(503, 'No se pudo marcar la lectura');
  return json({ marcados: r.data });
}
