// Catálogo › fotos (H1.9, control 8): sube una imagen al bucket `catalogo` y la suma a las
// fotos del modelo. Misma ruta = reemplazo (upsert): el link público no cambia, así que lo
// que Lucía ya mandó por WhatsApp pasa a mostrar la foto nueva. Sube la sesión del usuario,
// no la service role: las policies de storage.objects (0008 y 0025) son el filtro.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import { ENTIDADES } from '@/lib/edicion/entidades';
import { EXTENSION_FOTO, TAMANO_MAXIMO_FOTO, nombreSeguroFoto } from '@/lib/storage-fotos';

export async function POST(request: Request) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, 'Mandá la foto como multipart/form-data (campos modelo_id y archivo)');
  }
  const modeloId = String(form.get('modelo_id') ?? '');
  const archivo = form.get('archivo');
  if (!esUuid(modeloId)) return error(400, 'Falta modelo_id o no es válido');
  if (!(archivo instanceof File) || archivo.size === 0) return error(400, 'Falta el archivo');
  const extension = EXTENSION_FOTO[archivo.type];
  if (!extension) return error(400, 'Solo fotos JPG o PNG');
  if (archivo.size > TAMANO_MAXIMO_FOTO) return error(400, 'La foto pesa más de 5 MB');

  const { data: modelo, error: e1 } = await s.supabase
    .from('catalogo_alquiler')
    .select('id, version, fotos')
    .eq('id', modeloId)
    .maybeSingle();
  if (e1) return desdeErrorDeBase(e1);
  if (!modelo) return error(404, 'Ese modelo no existe');

  const ruta = `${modeloId}/${nombreSeguroFoto(archivo.name, extension)}`;
  const { error: e2 } = await s.supabase.storage
    .from('catalogo')
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type, cacheControl: '60' });
  if (e2) {
    console.error('[api/catalogo/fotos] no se pudo subir:', e2.message);
    return error(502, 'No se pudo subir la foto', e2.message);
  }
  const url = s.supabase.storage.from('catalogo').getPublicUrl(ruta).data.publicUrl;

  if (modelo.fotos.includes(url)) return json({ url, ruta, reemplazada: true, fila: modelo });

  // Mismas reglas que una edición del modelo (máximo de fotos, links válidos).
  const fotos = [...modelo.fotos, url];
  const r = ENTIDADES.modelos.editar.safeParse({ fotos });
  if (!r.success) return error(400, r.error.issues[0]?.message ?? 'Fotos inválidas');

  const { data: fila, error: e3 } = await s.supabase
    .from('catalogo_alquiler')
    .update({ fotos })
    .eq('id', modeloId)
    .eq('version', modelo.version)
    .select()
    .maybeSingle();
  if (e3) return desdeErrorDeBase(e3);
  if (!fila) {
    return error(409, 'Alguien editó el modelo mientras subías la foto: la foto quedó subida, volvé a intentar para sumarla');
  }
  return json({ url, ruta, reemplazada: false, fila }, 201);
}
