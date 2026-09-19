// Bandeja › "Devolver a Lucía" (PROCESOS.md § 4, paso 7): POST sin cuerpo. 'derivada' →
// 'activa' (despausa: el próximo mensaje del cliente lo contesta Lucía con todo el historial,
// sin volver a presentarse) y marca atendida cualquier derivación pendiente. 409 si la charla
// está cerrada; repetirlo no falla (ya_estaba).
import { requerirSesion } from '@/lib/api/sesion';
import { resolverAtencion } from '@/lib/edicion/atencion';

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return resolverAtencion(s, id, 'devolver');
}
