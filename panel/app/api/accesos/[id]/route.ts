// Aprobar o rechazar una solicitud de acceso (H1.10, control 2). POST
// { accion: 'aprobar' | 'rechazar', rol?: 'admin' | 'equipo' } — el rol solo al aprobar,
// 'equipo' por defecto. La base (resolver_solicitud, 0018) hace las dos escrituras juntas y
// rechaza a quien no es admin y a quien intenta resolver su propia solicitud.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, leerCuerpo } from '@/lib/api/validar';
import { resolverSolicitud } from '@/lib/queries/accesos';

const esquema = z.strictObject({
  accion: z.enum(['aprobar', 'rechazar']),
  rol: z.enum(['admin', 'equipo']).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;
  if (cuerpo.accion === 'rechazar' && cuerpo.rol) return error(400, 'El rol solo se elige al aprobar');

  const { data, error: e } = await resolverSolicitud(s, id, cuerpo.accion === 'aprobar', cuerpo.rol ?? 'equipo');
  if (e) return desdeErrorDeBase(e);
  return json({ solicitud: data });
}
