// Respuestas rápidas (0109, pedido de Sofía 22/10). GET: las lee cualquier aprobado (el equipo las
// usa con "/" en la Bandeja; la RLS deja leer a todos). POST { atajo, texto, orden?, activo? }: admin.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, json } from '@/lib/api/respuestas';
import { rutaAlta } from '@/lib/edicion/rutas';

export async function GET() {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { data, error } = await s.supabase
    .from('respuestas_rapidas')
    .select('id, atajo, texto, orden, activo, version')
    .order('orden')
    .order('creado_at');
  if (error) return desdeErrorDeBase(error);
  return json({ respuestas: data });
}

export const POST = rutaAlta('respuestas');
