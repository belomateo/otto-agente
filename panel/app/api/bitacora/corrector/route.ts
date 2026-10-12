import { z } from 'zod';
import { rutaConsulta } from '@/lib/api/consulta';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { listarCorrecciones } from '@/lib/queries/corrector';

export const GET = rutaConsulta(async (s) => listarCorrecciones(s.supabase), { admin: true });

const esquemaPedido = z.strictObject({
  pedido: z.string().trim().min(3, 'El pedido tiene que tener al menos 3 caracteres').max(2000, 'El pedido no puede pasar los 2000 caracteres'),
});

export async function POST(request: Request) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const cuerpo = await leerCuerpo(request, esquemaPedido);
  if (cuerpo instanceof Response) return cuerpo;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!supabaseUrl || !workerSecret) return error(500, 'Falta la configuración para llamar al corrector');

  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/corrector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': workerSecret },
      body: JSON.stringify({
        pedido: cuerpo.pedido,
        quien: s.usuario.email ?? s.perfil.nombre ?? 'admin',
        quien_id: s.usuario.id,
      }),
    });
    const datos = await r.json().catch(() => null);
    if (!r.ok) return error(r.status, datos?.error ?? 'El corrector no pudo analizar el pedido');
    return json(datos);
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
