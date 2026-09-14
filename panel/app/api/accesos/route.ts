// Configuración › Accesos (H1.10, control 1): lista las solicitudes (por defecto las
// pendientes). Solo un admin; un usuario 'equipo' recibe 403.
//
// El email de cada solicitante está en auth.users, que RLS no deja leer: se trae con la
// service role, y solo después de que requerirSesion confirmó que quien pide es admin.
import type { NextRequest } from 'next/server';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { ESTADOS_SOLICITUD, listarSolicitudes, type EstadoSolicitud } from '@/lib/queries/accesos';

export async function GET(request: NextRequest) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const estado = request.nextUrl.searchParams.get('estado') ?? 'pendiente';
  if (!(ESTADOS_SOLICITUD as readonly string[]).includes(estado)) {
    return error(400, 'estado tiene que ser pendiente, aprobada o rechazada');
  }
  try {
    const solicitudes = await listarSolicitudes(s, estado as EstadoSolicitud);
    const admin = crearClienteAdmin();
    const emails = await Promise.all(
      solicitudes.map(async (x) => {
        const { data } = await admin.auth.admin.getUserById(x.perfil_id);
        return data.user?.email ?? null;
      })
    );
    return json({ solicitudes: solicitudes.map((x, i) => ({ ...x, email: emails[i] })) });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
