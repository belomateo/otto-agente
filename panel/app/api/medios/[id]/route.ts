// Audios y fotos que manda el cliente por WhatsApp (0055, logica): GET /api/medios/[id] (id =
// mensajes.id) devuelve una URL firmada de corta duración para bajar el adjunto DIRECTO de
// Storage — no el binario por acá, para que un audio arranque al toque en vez de pasar entero
// por Next. adjunto_path y adjunto_media_id son internos: nunca salen de este archivo. El
// mensaje se lee con la sesión (RLS, 0007): si no lo puede leer, tampoco existe para firmar —
// misma barrera que ya protege /api/bandeja, no una vía nueva (aviso de logica).
//
// PATCH reintenta un adjunto en 'error': adjunto_reintentar() (logica) no es un simple UPDATE
// de estado — encola el trabajo que el worker necesita para bajarlo de nuevo y lo despierta.
// 'listo' no se reintenta a propósito (bajaría el archivo de nuevo por nada y borraría la
// transcripción); 'pendiente' u otro reintento mientras ya está en cola devuelve ya_estaba:
// true en vez de error, así que un doble clic no rompe nada.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import { crearClienteAdmin } from '@/lib/supabase/admin';

// 90 segundos: alcanza para que el navegador arranque a bajarlo: ver PROCESOS.md/aviso de
// logica — ni tan corto que expire mientras carga, ni tan largo que quede circulando.
const DURACION_FIRMA_SEGUNDOS = 90;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');

  const { data, error: e } = await s.supabase.from('mensajes').select('adjunto_path, adjunto_estado, adjunto_mime').eq('id', id).maybeSingle();
  if (e) return desdeErrorDeBase(e);
  // adjunto_path recién existe cuando ya se bajó (0055): 'pendiente' no lo tiene todavía, así
  // que "tiene adjunto" se mira por adjunto_estado, no por adjunto_path.
  if (!data || !data.adjunto_estado) return error(404, 'Ese mensaje no tiene un adjunto');
  if (data.adjunto_estado !== 'listo' || !data.adjunto_path) {
    return error(409, 'El adjunto todavía no está listo', { motivo: data.adjunto_estado });
  }

  const admin = crearClienteAdmin();
  const { data: firmada, error: eFirma } = await admin.storage.from('adjuntos').createSignedUrl(data.adjunto_path, DURACION_FIRMA_SEGUNDOS);
  if (eFirma) {
    console.error('[api/medios] no se pudo firmar la URL:', eFirma.message);
    return error(500, 'No se pudo generar el link del adjunto');
  }
  return json({ url: firmada.signedUrl, mime: data.adjunto_mime });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');

  const { data, error: e } = await s.supabase.rpc('adjunto_reintentar', { p_mensaje: id });
  if (e) return desdeErrorDeBase(e);
  return json(data);
}
