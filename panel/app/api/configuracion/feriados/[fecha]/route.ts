// Posibles feriados (0098, pedido de Mateo 10/10): «Local abierto» o «Local cerrado» desde el
// calendario de Turnos. PATCH { local_abierto, confirmar? }. Solo admin — abrir o cerrar el local
// un feriado es una decisión de negocio, igual que los cierres (/api/configuracion/cierres), y la
// RLS de 0098 lo exige también. La lógica está en decidirFeriado (lib/queries/feriados.ts):
// «Local cerrado» además carga el cierre del día (0061) y «Local abierto» lo quita.
//
// Si el día ya tiene turnos activos, «Local cerrado» no escribe nada y devuelve 409 con cuántos
// hay, igual que cerrar un día desde cierres: esos turnos no se cancelan y hay que llamarlos. Para
// cerrar igual (y dejarlos como están) se manda confirmar: true.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { esFecha } from '@/lib/formato';
import { decidirFeriado } from '@/lib/queries/feriados';

const esquema = z.strictObject({
  local_abierto: z.boolean({ error: 'Mandá true (local abierto) o false (local cerrado)' }),
  confirmar: z.boolean().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ fecha: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { fecha } = await ctx.params;
  if (!esFecha(fecha)) return error(400, 'Fecha inválida (esperado AAAA-MM-DD)');
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  try {
    const r = await decidirFeriado(s, fecha, cuerpo.local_abierto, cuerpo.confirmar === true);
    if (!r) return error(404, 'Esa fecha no es un posible feriado');
    if (!r.ok) {
      return error(409, `Ese día ya tiene ${r.turnos_afectados} turno(s): confirmá si igual querés cerrarlo`, {
        turnos_afectados: r.turnos_afectados,
      });
    }
    return json({ feriado: r.feriado });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
