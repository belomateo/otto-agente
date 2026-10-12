import { z } from 'zod';
import { rutaConsultaConId } from '@/lib/api/consulta';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, leerCuerpo } from '@/lib/api/validar';
import { descartarCorreccion, leerCorreccionConPruebas } from '@/lib/queries/corrector';

export const GET = rutaConsultaConId(
  async (s, id) => {
    const c = await leerCorreccionConPruebas(s.supabase, id);
    if (!c) return error(404, 'Esa corrección no existe');
    return c;
  },
  { admin: true },
);

const esquemaElegir = z.strictObject({
  opcion: z.enum(['editar', 'agregar']),
  indice: z.number().int().min(0),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const cuerpo = await leerCuerpo(request, esquemaElegir);
  if (cuerpo instanceof Response) return cuerpo;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!supabaseUrl || !workerSecret) return error(500, 'Falta la configuración para llamar al corrector');

  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/corrector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': workerSecret },
      body: JSON.stringify({
        correccion_id: id,
        opcion: cuerpo.opcion,
        indice: cuerpo.indice,
        quien: s.usuario.email ?? s.perfil.nombre ?? 'admin',
      }),
    });
    const datos = await r.json().catch(() => null);
    if (!r.ok) return error(r.status, datos?.error ?? 'El corrector no pudo aplicar la elección');
    return json(datos);
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');

  try {
    const r = await descartarCorreccion(s, id);
    if (!r.ok) return error(409, r.error ?? 'No se pudo descartar');
    return json({ ok: true });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
