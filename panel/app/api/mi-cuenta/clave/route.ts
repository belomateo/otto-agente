// Cambiar la propia contraseña (0059, decisión de Mateo 21/9): pide la actual Y la nueva juntas
// en el mismo request — comparar las dos ahí mismo es lo que impide reusar la clave temporal de
// un alta directa, sin tener que guardarla ni hashearla en ningún lado.
//
// Ruta exenta en middleware.ts (RUTA_API_CAMBIO_CLAVE): tiene que poder llamarse mientras
// debe_cambiar_clave sigue en true, si no nadie con clave temporal podría llegar nunca acá.
//
// 6 es el mínimo real del proyecto (probado contra la Admin API, 21/9: 5 lo rechaza, 6 lo
// acepta) — el mismo que ya usa front; si algún día cambia el mínimo del proyecto, hay que tocar
// los dos lados o el error de Supabase le llega crudo a la persona.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { error, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { claveActualEsCorrecta, terminarCambioClave } from '@/lib/queries/mi-cuenta';

const esquema = z.strictObject({
  actual: z.string().min(1, 'Falta la contraseña actual'),
  nueva: z.string().min(6, 'La contraseña nueva tiene que tener al menos 6 caracteres').max(72),
});

export async function PATCH(request: Request) {
  const s = await requerirSesion({ claveTemporalOk: true });
  if (s instanceof Response) return s;
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  if (cuerpo.nueva === cuerpo.actual) {
    return error(400, 'La contraseña nueva tiene que ser distinta de la actual');
  }

  const email = s.usuario.email;
  if (!email) {
    console.error('[api] la cuenta', s.usuario.id, 'no tiene email en auth.users');
    return error(500, 'Esta cuenta no tiene un mail asociado');
  }
  const actualOk = await claveActualEsCorrecta(email, cuerpo.actual);
  if (!actualOk) return error(401, 'La contraseña actual no es correcta');

  const { error: eCambiar } = await s.supabase.auth.updateUser({ password: cuerpo.nueva });
  if (eCambiar) {
    console.error('[api] no se pudo cambiar la contraseña:', eCambiar.message);
    return error(502, 'No se pudo cambiar la contraseña. Probá de nuevo.');
  }

  // La bandera baja recién acá, después de que updateUser ya confirmó (fail closed): si esto
  // fallara, mejor que la cuenta siga pidiendo el cambio a que quede aprobada pensando que ya
  // lo hizo.
  const { error: eTerminar } = await terminarCambioClave(s);
  if (eTerminar) {
    console.error('[api] la contraseña cambió pero no se pudo terminar el trámite:', eTerminar.message);
    return error(502, 'La contraseña se cambió, pero hubo un problema al terminar. Volvé a entrar.');
  }

  return json({ ok: true });
}
