// Bitácora › Analista: PATCH /api/bitacora/analista/[id] { estado: 'hecho' | 'descartado' | 'pendiente' }
// (0102, pedido de Mateo del 10/10). Marca un error o una mejora del analista; 'pendiente' lo deshace.
// Solo admin: la ruta lo exige y la RLS de 0102 también (y ahí solo se puede cambiar el estado). Quién
// lo marcó y cuándo lo pone la base, no este pedido. Marcar no cambia nada de Lucía: es para llevar
// la cuenta de qué se resolvió.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, leerCuerpo } from '@/lib/api/validar';
import { marcarHallazgo } from '@/lib/queries/analista';

// Los mismos tres estados que el check de 0102 (ESTADOS_HALLAZGO en lib/queries/analista.ts).
const esquema = z.strictObject({
  estado: z.enum(['pendiente', 'hecho', 'descartado'], { error: 'estado tiene que ser hecho, descartado o pendiente' }),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  try {
    const hallazgo = await marcarHallazgo(s, id, cuerpo.estado);
    if (!hallazgo) return error(404, 'Ese punto del analista no existe');
    return json({ hallazgo });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
