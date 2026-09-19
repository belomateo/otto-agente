// Configuración › Lucía › Avanzado: el prompt base (H1.9, control 4). GET trae la versión
// vigente y si el generador está disponible; PUT la guarda solo si el generador la aprueba
// (lib/edicion/prompt.ts). Solo admin.
import { existsSync } from 'node:fs';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, json } from '@/lib/api/respuestas';
import { rutaGenerador } from '@/lib/edicion/prompt';
import { rutaGuardarUnica } from '@/lib/edicion/rutas';

export async function GET() {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { data, error } = await s.supabase
    .from('prompt_base')
    .select('id, texto, version, editado_por, editado_at')
    .maybeSingle();
  if (error) return desdeErrorDeBase(error);
  return json({ prompt: data, generador_disponible: existsSync(/*turbopackIgnore: true*/ rutaGenerador()) });
}

export const PUT = rutaGuardarUnica('prompt');
