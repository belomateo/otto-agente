// Configuración › Accesos › Invitar por mail (H1.10, decisión de Mateo 17/9). GET lista las
// invitaciones (usadas y sin usar); POST crea una. Solo admin: crear una invitación con
// rol='admin' es, en los hechos, crear otro admin. La base (crear_invitacion, 0053) re-verifica
// es_admin() por su cuenta y no confía solo en este chequeo.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { crearInvitacion, listarInvitaciones } from '@/lib/queries/accesos';
import { mandarMailInvitacion } from '@/lib/mail-invitacion';

const esquema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido'),
  rol: z.enum(['admin', 'equipo']),
});

export async function GET() {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  try {
    const invitaciones = await listarInvitaciones(s);
    return json({ invitaciones });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}

export async function POST(request: Request) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  const { data, error: e } = await crearInvitacion(s, cuerpo.email, cuerpo.rol);
  if (e) return desdeErrorDeBase(e);
  // La invitación ya está creada (la garantía real): el mail es una comodidad, nunca puede
  // convertir esto en un error para el admin que la mandó.
  await mandarMailInvitacion(cuerpo.email, cuerpo.rol);
  return json({ invitacion: data }, 201);
}
