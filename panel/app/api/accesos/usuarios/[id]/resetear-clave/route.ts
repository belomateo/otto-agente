// Resetear la clave de alguien sin depender de mail (0062, pedido de Mateo 22/9): mismo
// mecanismo probado en la alta directa (0059) — clave temporal con crypto.randomUUID(), nunca
// Math.random, nunca guardada ni loggeada, viaja en esta respuesta UNA sola vez. Sin correo:
// Resend en modo sandbox rebota a cualquiera que no sea la cuenta dueña, así que un flujo por
// mail hoy no le llegaría a nadie del equipo.
import { randomUUID } from 'node:crypto';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { marcarClaveReseteada } from '@/lib/queries/accesos';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');

  const claveTemporal = randomUUID();
  const admin = crearClienteAdmin();
  const { error: eClave } = await admin.auth.admin.updateUserById(id, { password: claveTemporal });
  if (eClave) {
    if (eClave.code === 'user_not_found') return error(404, 'Ese usuario no existe');
    console.error('[api] no se pudo resetear la clave:', eClave.code, eClave.message);
    return error(502, 'No se pudo resetear la contraseña');
  }

  const { data: perfil, error: eMarcar } = await marcarClaveReseteada(s, id);
  if (eMarcar) return desdeErrorDeBase(eMarcar);

  return json({
    perfil,
    clave_temporal: claveTemporal,
    aviso: 'Esta es la única vez que se muestra la contraseña temporal: no queda guardada en ningún lado. Copiala antes de cerrar.',
  });
}
