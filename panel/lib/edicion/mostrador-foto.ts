// Mandar una foto desde una derivación (decisión de Mateo, 16/9): sube el archivo a Storage
// (bucket `adjuntos`, privado — no `catalogo`, que es público y de escritura solo-admin) y le
// pasa el PATH a mostrador_enviar_foto(conversacion, storage_path, epigrafe) — la hace logica
// en la base (migración *cola*), con las mismas reglas que mostrador_enviar. El worker es quien
// sube el archivo a WhatsApp (primero a /media, con service_role) y arma el mensaje con el
// media_id: acá no se manda ningún binario a WhatsApp.
//
// Errores de mostrador_enviar_foto, iguales a mostrador_enviar (mostrador.ts):
//   42501  sin permiso (no aprobado)                              → 403
//   P0002  la charla no existe                                     → 404
//   55000  no está tomada o pasaron más de 24 hs                   → 409, con detalle.motivo
//   22023  el epígrafe es demasiado largo                          → 400
import 'server-only';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';
import { EXTENSION_FOTO, TAMANO_MAXIMO_FOTO, nombreSeguroFoto } from '@/lib/storage-fotos';

const POR_CODIGO: Record<string, number> = { '42501': 403, P0002: 404, '55000': 409, '22023': 400 };

function motivoDe55000(mensaje: string): 'ventana_cerrada' | 'no_tomada' {
  return /24 hs/.test(mensaje) ? 'ventana_cerrada' : 'no_tomada';
}

export async function enviarFotoMostrador(sesion: Sesion, conversacionId: string, request: Request) {
  if (!esUuid(conversacionId)) return error(400, 'Identificador inválido');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, 'Mandá la foto como multipart/form-data (campo archivo)');
  }
  const archivo = form.get('archivo');
  const epigrafe = form.get('epigrafe');
  if (!(archivo instanceof File) || archivo.size === 0) return error(400, 'Falta el archivo');
  const extension = EXTENSION_FOTO[archivo.type];
  if (!extension) return error(400, 'Solo fotos JPG o PNG');
  if (archivo.size > TAMANO_MAXIMO_FOTO) return error(400, 'La foto pesa más de 5 MB');
  if (epigrafe !== null && typeof epigrafe !== 'string') return error(400, 'El epígrafe tiene que ser texto');

  const ruta = `mostrador/${conversacionId}/${Date.now()}-${nombreSeguroFoto(archivo.name, extension)}`;
  const { error: e1 } = await sesion.supabase.storage
    .from('adjuntos')
    .upload(ruta, archivo, { contentType: archivo.type });
  if (e1) {
    console.error('[api/bandeja/foto] no se pudo subir:', e1.message);
    return error(502, 'No se pudo subir la foto');
  }

  const { data, error: e2 } = await sesion.supabase.rpc('mostrador_enviar_foto', {
    p_conversacion: conversacionId,
    p_storage_path: ruta,
    p_epigrafe: epigrafe || null,
  });
  if (e2) {
    // La foto ya quedó subida en Storage aunque el mensaje no se haya podido mandar (charla
    // no tomada, ventana cerrada): queda huérfana ahí, no vale la pena borrarla solo por esto.
    const status = e2.code ? POR_CODIGO[e2.code] : undefined;
    if (status) return error(status, e2.message, e2.code === '55000' ? { motivo: motivoDe55000(e2.message) } : undefined);
    return desdeErrorDeBase(e2);
  }
  return json(data, 201);
}
