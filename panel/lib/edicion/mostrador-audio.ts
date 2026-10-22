// Mandar un audio desde una derivación (pedido de Sofía, 22/10): mismo camino que la foto
// (mostrador-foto.ts): se sube al bucket privado `adjuntos` y se le pasa la ruta a
// mostrador_enviar_audio (0109), que vuelve a validar tipo y tamaño contra Storage. El worker lo
// sube a WhatsApp. Mismos códigos de error que la foto.
import 'server-only';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';

// Lo que acepta WhatsApp Cloud API para audio. webm no: Chrome viejo graba solo eso y Meta lo
// rechaza, así que el panel ni lo ofrece (ChatThread avisa que ese navegador no puede).
const EXTENSION_AUDIO: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
};
const TAMANO_MAXIMO_AUDIO = 16 * 1024 * 1024;
const POR_CODIGO: Record<string, number> = { '42501': 403, P0002: 404, '55000': 409, '22023': 400 };

export async function enviarAudioMostrador(sesion: Sesion, conversacionId: string, request: Request) {
  if (!esUuid(conversacionId)) return error(400, 'Identificador inválido');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, 'Mandá el audio como multipart/form-data (campo archivo)');
  }
  const archivo = form.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) return error(400, 'Falta el audio');
  // 'audio/ogg;codecs=opus' → 'audio/ogg'
  const mime = archivo.type.split(';')[0].trim().toLowerCase();
  const extension = EXTENSION_AUDIO[mime];
  if (!extension) return error(400, 'WhatsApp no acepta ese formato de audio');
  if (archivo.size > TAMANO_MAXIMO_AUDIO) return error(400, 'El audio pesa más de 16 MB');

  const ruta = `mostrador/${conversacionId}/${Date.now()}-audio.${extension}`;
  const { error: e1 } = await sesion.supabase.storage.from('adjuntos').upload(ruta, archivo, { contentType: mime });
  if (e1) {
    console.error('[api/bandeja/audio] no se pudo subir:', e1.message);
    return error(502, 'No se pudo subir el audio');
  }

  const { data, error: e2 } = await sesion.supabase.rpc('mostrador_enviar_audio', {
    p_conversacion: conversacionId,
    p_storage_path: ruta,
  });
  if (e2) {
    const status = e2.code ? POR_CODIGO[e2.code] : undefined;
    if (status) {
      const motivo = /24 hs/.test(e2.message) ? 'ventana_cerrada' : 'no_tomada';
      return error(status, e2.message, e2.code === '55000' ? { motivo } : undefined);
    }
    return desdeErrorDeBase(e2);
  }
  return json(data, 201);
}
