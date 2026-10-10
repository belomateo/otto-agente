'use client';

// Posibles feriados en el calendario de Turnos (pedido de Mateo, 10/10: «que en el calendario
// aparezcan los posibles feriados de Argentina, que Lucía no recomiende esas fechas, y que haya un
// botón de local abierto o cerrado»). Va en lugar de CierreDelDia cuando el día está en
// feriados_posibles (0098): sin decidir, Lucía no ofrece ese día aunque el local no esté cerrado;
// «Local abierto» lo vuelve un día normal y «Local cerrado» además lo carga en cierres_agenda (0061),
// que es lo que hace que Lucía avise que el local no abre y que el recordatorio no salga (0093).
// Solo administradores: la API (PATCH /api/configuracion/feriados/[fecha]) y la RLS lo exigen, y al
// resto no se le muestran los botones, solo el texto. Cerrar un día con turnos no los cancela:
// avisa cuántos hay para llamarlos, igual que CierreDelDia.

import { useState } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useUsuario } from '@/components/nav/UsuarioContext';
import type { FeriadoAgenda } from '@/lib/queries/feriados';

type Cierre = { motivo: string | null } | null;
export type EstadoFeriado = 'posible' | 'abre' | 'cerrado';

/**
 * Lo que vale para Lucía (diasSinTurnos, supabase/functions/_shared/agenda/huecos.ts): un cierre
 * manda sobre lo que diga el feriado —por ejemplo uno cargado desde Configuración › Agenda—; sin
 * cierre, null es «posible feriado» (no ofrece el día) y false, cerrado. Lo usan también el resumen
 * del día y la vista del mes (page.tsx), para que el calendario diga lo mismo en los tres lugares.
 */
export function estadoFeriado(feriado: FeriadoAgenda, cierre: Cierre | undefined): EstadoFeriado {
  if (cierre || feriado.local_abierto === false) return 'cerrado';
  return feriado.local_abierto ? 'abre' : 'posible';
}

// Ámbar es «esperando» en la paleta (DISENO.md): un posible feriado es una decisión pendiente. El
// que abre es un día normal (neutro); el cerrado, igual que CierreDelDia.
const CAJA: Record<EstadoFeriado, string> = {
  posible: 'border-ambar/40 bg-ambar-suave text-ambar',
  abre: 'border-borde bg-lino text-grafito',
  cerrado: 'border-ladrillo/30 bg-ladrillo-suave text-ladrillo',
};
const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobre';
const BOTON = `flex-none rounded-otto border bg-lino px-3 py-1.5 font-medium disabled:opacity-50 ${FOCO}`;
const BOTON_ABRIR = `${BOTON} border-borde text-tinta`;
// En la caja del cerrado, el de abrir va como «Quitar el cierre» de CierreDelDia.
const BOTON_LADRILLO = `${BOTON} border-ladrillo/40 text-ladrillo`;

// Qué se está guardando: el botón que se tocó es el que dice «Guardando…».
type Accion = 'abrir' | 'cerrar' | 'cerrar-igual';

export function FeriadoDelDia({ fecha, feriado, cierre, onCambio }: { fecha: string; feriado: FeriadoAgenda; cierre: Cierre; onCambio: () => void }) {
  const esAdmin = useUsuario()?.rol === 'admin';
  const [enviando, setEnviando] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnosAfectados, setTurnosAfectados] = useState<number | null>(null);
  const estado = estadoFeriado(feriado, cierre);

  async function decidir(accion: Accion) {
    const localAbierto = accion === 'abrir';
    setEnviando(accion);
    setError(null);
    try {
      await enviar(`/api/configuracion/feriados/${fecha}`, 'PATCH', { local_abierto: localAbierto, confirmar: accion === 'cerrar-igual' });
      setTurnosAfectados(null);
      onCambio();
    } catch (e) {
      if (!localAbierto && e instanceof ErrorApi && e.status === 409) {
        const detalle = e.detalle as { turnos_afectados?: number } | undefined;
        setTurnosAfectados(detalle?.turnos_afectados ?? 0);
      } else {
        setError(e instanceof ErrorApi ? e.message : localAbierto ? 'No se pudo abrir el día' : 'No se pudo cerrar el día');
      }
    } finally {
      setEnviando(null);
    }
  }

  const texto =
    estado === 'posible'
      ? `Posible feriado · ${feriado.nombre}. Lucía no ofrece turnos este día.`
      : estado === 'abre'
        ? `Feriado · ${feriado.nombre}: el local abre. Lucía ofrece turnos como un día normal.`
        : `Cerrado · Feriado · ${feriado.nombre}. Lucía no ofrece turnos y avisa que el local no abre.`;
  const ocupado = enviando !== null;

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className={`flex flex-wrap items-center gap-2 rounded-otto border px-3 py-2 text-[14px] md:text-[13px] ${CAJA[estado]}`}>
        <span className="min-w-0 flex-1 font-medium">{texto}</span>
        {esAdmin && estado !== 'abre' && (
          <button type="button" onClick={() => decidir('abrir')} disabled={ocupado} className={estado === 'cerrado' ? BOTON_LADRILLO : BOTON_ABRIR}>
            {enviando === 'abrir' ? 'Guardando…' : 'Local abierto'}
          </button>
        )}
        {esAdmin && estado !== 'cerrado' && (
          <button type="button" onClick={() => decidir('cerrar')} disabled={ocupado} className={BOTON_LADRILLO}>
            {enviando === 'cerrar' ? 'Guardando…' : 'Local cerrado'}
          </button>
        )}
      </div>
      {turnosAfectados !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-otto border border-ambar bg-ambar-suave px-3 py-2 text-[14px] text-ambar">
          <span className="flex-1">
            Este día ya tiene {turnosAfectados} turno{turnosAfectados === 1 ? '' : 's'}. Cerrarlo no los cancela y a esos clientes no les llega
            ningún aviso: hay que llamarlos para pasarlos a otro día.
          </span>
          <button
            type="button"
            onClick={() => decidir('cerrar-igual')}
            disabled={ocupado}
            className={`flex-none rounded-otto border border-ambar bg-lino px-3 py-1.5 text-[14px] font-medium text-ambar disabled:opacity-50 ${FOCO}`}
          >
            {enviando === 'cerrar-igual' ? 'Guardando…' : 'Cerrar igual'}
          </button>
          <button
            type="button"
            onClick={() => setTurnosAfectados(null)}
            disabled={ocupado}
            className={`flex-none text-[14px] text-grafito underline-offset-2 hover:underline disabled:opacity-50 md:text-[13px] ${FOCO}`}
          >
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="text-[13px] text-ladrillo">
          {error}
        </div>
      )}
    </div>
  );
}
