// Bandeja › tomar una charla (PROCESOS.md § 4, paso 6): POST sin cuerpo. 'activa' → 'derivada'
// y, si había una derivación pendiente, queda atendida. Repetirlo no falla (ya_estaba).
import { requerirSesion } from '@/lib/api/sesion';
import { resolverAtencion } from '@/lib/edicion/atencion';

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return resolverAtencion(s, id, 'tomar');
}
