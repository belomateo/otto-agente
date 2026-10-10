// Posibles feriados (0098, pedido de Mateo 10/10: «que en el calendario aparezcan los posibles
// feriados de Argentina, que Lucía no recomiende esas fechas, y que haya un botón de local abierto o
// cerrado»). La tabla trae cargados de antemano los feriados nacionales; cada uno empieza sin
// decidir (local_abierto null) y así Lucía no ofrece ese día, aunque el local no esté cerrado. Un
// admin lo decide desde Turnos: «Local abierto» (true) lo vuelve un día normal; «Local cerrado»
// (false) además lo carga en cierres_agenda (0061, cierres.ts), que es lo que hace que Lucía avise
// que el local no abre, que la base no deje agendar y que no salga el recordatorio (0093). Para
// Lucía un cierre manda sobre lo que diga el feriado (diasSinTurnos, en
// supabase/functions/_shared/agenda/huecos.ts); el panel lo muestra con la misma regla
// (estadoFeriado, FeriadoDelDia.tsx).
//
// 0098 la aplica Mateo a mano y el panel puede salir antes: mientras la tabla no exista no hay
// posibles feriados (faltaLaTabla, igual que los bloqueos de 0067) y la agenda se ve como siempre.
import 'server-only';
import type { Sesion } from '@/lib/api/sesion';
import { faltaLaTabla } from './bloqueos';
import { borrarCierre, crearCierre } from './cierres';
import type { ClienteDb, Fila } from './comun';

export type FeriadoPosible = Fila<'feriados_posibles'>;

/** Un posible feriado como lo muestra la agenda (AgendaDelDia.feriado, DiaDelMes.feriado).
 *  local_abierto: null = sin decidir (Lucía no ofrece ese día), true = el local abre (día normal),
 *  false = cerrado (y además está en cierres_agenda). */
export type FeriadoAgenda = { nombre: string; local_abierto: boolean | null };

/**
 * Posibles feriados entre dos fechas 'YYYY-MM-DD', ambas inclusive, por fecha. Contra el texto de
 * la fecha (columna date: no pasa por Date ni por el huso del servidor). Sin 0098 aplicada, vacío.
 * Recibe el cliente y no la sesión: lo usan turnosDelDia() y turnosDelMes().
 */
export async function feriadosEntre(db: ClienteDb, desde: string, hasta: string): Promise<Map<string, FeriadoAgenda>> {
  const { data, error } = await db.from('feriados_posibles').select('fecha, nombre, local_abierto').gte('fecha', desde).lte('fecha', hasta);
  if (error) {
    if (faltaLaTabla(error)) return new Map();
    throw error;
  }
  return new Map((data ?? []).map((f) => [f.fecha, { nombre: f.nombre, local_abierto: f.local_abierto }]));
}

export type ResultadoDecidirFeriado = { ok: true; feriado: FeriadoPosible } | { ok: false; turnos_afectados: number };

/**
 * «Local abierto» (localAbierto true) o «Local cerrado» (false) para un posible feriado. null =
 * esa fecha no es un posible feriado (o 0098 todavía no está aplicada): la ruta contesta 404.
 *
 * Cerrar un día con turnos activos no los cancela (mismo criterio que crearCierre): sin
 * `confirmar`, no escribe nada y devuelve cuántos hay, para que el panel avise que hay que
 * llamarlos.
 */
export async function decidirFeriado(sesion: Sesion, fecha: string, localAbierto: boolean, confirmar: boolean): Promise<ResultadoDecidirFeriado | null> {
  const { data: feriado, error: eLeer } = await sesion.supabase.from('feriados_posibles').select('fecha, nombre').eq('fecha', fecha).maybeSingle();
  if (eLeer) {
    if (faltaLaTabla(eLeer)) return null;
    throw eLeer;
  }
  if (!feriado) return null;

  // No hay transacción entre las dos tablas desde acá (serían dos pedidos a PostgREST), así que el
  // orden importa por si el segundo paso falla: primero se toca el cierre y después se anota la
  // decisión. Si falla lo segundo, el panel sigue mostrando el estado anterior y se reintenta;
  // al revés, podía quedar diciendo «el local abre» con el día todavía cerrado para Lucía.
  if (localAbierto) {
    // Sin cierre para esa fecha, borrarCierre() no hace nada (null): no es un error.
    await borrarCierre(sesion, fecha);
  } else {
    // Si el día ya estaba cerrado (desde Configuración › Agenda, o lo dejó así 0098) se deja ese
    // cierre como está: ni se pisa su motivo ni se pregunta por los turnos de un día ya cerrado.
    const { data: yaCerrado, error: eCierre } = await sesion.supabase.from('cierres_agenda').select('fecha').eq('fecha', fecha).maybeSingle();
    if (eCierre) throw eCierre;
    if (!yaCerrado) {
      try {
        const r = await crearCierre(sesion, fecha, `Feriado · ${feriado.nombre}`, confirmar);
        if (!r.ok) return r;
      } catch (e) {
        // 23505: otro admin lo cerró entre la consulta y el alta (la fecha es la clave). Ya está
        // cerrado, que es lo que se pidió.
        if ((e as { code?: string }).code !== '23505') throw e;
      }
    }
  }

  const { data, error } = await sesion.supabase
    .from('feriados_posibles')
    .update({ local_abierto: localAbierto, decidido_por: sesion.usuario.id, decidido_at: new Date().toISOString() })
    .eq('fecha', fecha)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ? { ok: true, feriado: data } : null;
}
