// Alta directa de una cuenta (decisión de Mateo, 21/9, a raíz de una auditoría de seguridad):
// reemplaza invitar por mail y esperar que la persona se registre sola. Un admin crea la cuenta
// ya mismo (auth.admin.createUser, service role, con el mail ya confirmado) con una contraseña
// temporal generada acá; la cuenta queda aprobada pero obligada a cambiarla antes de poder usar
// el panel (debe_cambiar_clave, 0059 — el middleware la manda a /cambiar-clave).
//
// La contraseña generada viaja en esta respuesta UNA sola vez: no se guarda en ningún lado (ni
// en la base, ni en un log) y no hay forma de volver a verla si se cierra el diálogo sin
// copiarla — la única salida en ese caso es dar de baja la cuenta y crearla de nuevo.
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requerirSesion } from '@/lib/api/sesion';
import { error, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { completarAltaAdmin } from '@/lib/queries/accesos';

const esquema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido'),
  nombre: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  const claveTemporal = randomUUID();
  const admin = crearClienteAdmin();
  const { data: alta, error: eCrear } = await admin.auth.admin.createUser({
    email: cuerpo.email,
    password: claveTemporal,
    email_confirm: true,
    user_metadata: cuerpo.nombre ? { nombre: cuerpo.nombre } : undefined,
  });
  if (eCrear) {
    if (eCrear.code === 'email_exists' || eCrear.message?.toLowerCase().includes('already been registered')) {
      return error(409, 'Esa persona ya tiene cuenta: cambiale el rol desde la lista, no hace falta crearla de nuevo');
    }
    console.error('[api] no se pudo crear la cuenta:', eCrear.code, eCrear.message);
    return error(502, 'No se pudo crear la cuenta');
  }

  const { data: perfil, error: eCompletar } = await completarAltaAdmin(s, alta.user.id);
  if (eCompletar) {
    // La cuenta en auth.users ya existe aunque esto falle: no se hace un segundo intento
    // automático (podría pisar un cambio manual mientras tanto). Queda pendiente/equipo, sin
    // acceso real (RLS exige estado='aprobado') — un admin puede reintentar completarla o dar
    // de baja la cuenta a mano.
    console.error('[api] cuenta creada pero no se pudo completar el alta:', eCompletar.code, eCompletar.message);
    return error(502, 'La cuenta se creó pero no se pudo terminar de aprobar. Avisale a quien mantiene el panel.');
  }

  return json(
    {
      perfil,
      email: cuerpo.email,
      clave_temporal: claveTemporal,
      aviso: 'Esta es la única vez que se muestra la contraseña temporal: no queda guardada en ningún lado. Copiala antes de cerrar.',
    },
    201
  );
}
