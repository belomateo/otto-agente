// El OK del cartel de turno (H1.16, decisión #10). Lo hace la base en dar_ok_aviso_turno
// (0031), en una sola transacción: registra quién y cuándo y, si el turno seguía
// 'sin-confirmar' y nadie lo había confirmado, lo pasa a 'confirmado' con confirmado_por = el
// email de la sesión. Si ya lo había confirmado el cliente, solo registra el OK. La firma sale
// de la sesión, nunca del request, y el historial lo deja el trigger de turnos.
import 'server-only';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';
import type { Fila } from '@/lib/queries/comun';

export type RespuestaOkAviso = {
  /** Otro ya había dado el OK: no se tocó nada y el OK sigue firmado por esa persona. */
  ya_estaba: boolean;
  /** Este OK pasó el turno de 'sin-confirmar' a 'confirmado'. */
  confirmo: boolean;
  turno: Fila<'turnos'>;
};

export async function darOkAviso(sesion: Sesion, turnoId: string) {
  if (!esUuid(turnoId)) return error(400, 'Identificador inválido');
  const { data, error: e } = await sesion.supabase.rpc('dar_ok_aviso_turno', { p_turno: turnoId });
  if (e) {
    // 55000: fuera de la ventana del aviso (todavía no, ya terminó, cancelado o no-vino). El
    // motivo viene en castellano desde la base.
    if (e.code === '55000') return error(409, e.message);
    return desdeErrorDeBase(e);
  }
  return json(data as unknown as RespuestaOkAviso);
}
