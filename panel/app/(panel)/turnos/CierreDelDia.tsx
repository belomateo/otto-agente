'use client';

// Feriados y días cerrados desde el calendario de Turnos (pedido de Mateo, 9/10: «que Sofía pueda
// agregar los feriados y que se agreguen desde la agenda de turnos»). Es lo mismo que Configuración ›
// Agenda › Feriados y cierres puntuales (0061, /api/configuracion/cierres), al alcance de donde se
// mira la agenda. Un día cerrado no tiene huecos para Lucía, ella avisa que el local no abre y el
// recordatorio no sale (0093). Solo administradores: la API y la RLS lo exigen, y al resto no se le
// muestra el botón. Cerrar un día con turnos no los cancela: avisa cuántos hay para llamarlos.

import { useState } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useUsuario } from '@/components/nav/UsuarioContext';

type Cierre = { motivo: string | null } | null;

export function CierreDelDia({ fecha, cierre, onCambio }: { fecha: string; cierre: Cierre; onCambio: () => void }) {
  const esAdmin = useUsuario()?.rol === 'admin';
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('Feriado');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnosAfectados, setTurnosAfectados] = useState<number | null>(null);

  async function cerrar(confirmar: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/cierres', 'POST', { fecha, motivo: motivo.trim() || null, confirmar });
      setAbierto(false);
      setTurnosAfectados(null);
      onCambio();
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 409) {
        const detalle = e.detalle as { turnos_afectados?: number } | undefined;
        setTurnosAfectados(detalle?.turnos_afectados ?? 0);
      } else {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cerrar el día');
      }
    } finally {
      setEnviando(false);
    }
  }

  async function reabrir() {
    setEnviando(true);
    setError(null);
    try {
      await enviar(`/api/configuracion/cierres/${fecha}`, 'DELETE');
      onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo quitar el cierre');
    } finally {
      setEnviando(false);
    }
  }

  if (cierre) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-otto border border-ladrillo/30 bg-ladrillo-suave px-3 py-2 text-[14px] text-ladrillo md:text-[13px]">
        <span className="flex-1 font-medium">
          Cerrado{cierre.motivo ? ` · ${cierre.motivo}` : ''}. Lucía no ofrece turnos este día y avisa que el local no abre.
        </span>
        {esAdmin && (
          <button type="button" onClick={reabrir} disabled={enviando} className="flex-none rounded-otto border border-ladrillo/40 bg-lino px-3 py-1.5 font-medium text-ladrillo disabled:opacity-50">
            {enviando ? 'Abriendo…' : 'Quitar el cierre'}
          </button>
        )}
        {error && <div className="basis-full text-[13px]">{error}</div>}
      </div>
    );
  }

  if (!esAdmin) return null;

  if (!abierto) {
    return (
      <div className="mb-3">
        <button type="button" onClick={() => setAbierto(true)} className="text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
          Marcar feriado / cerrar este día
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-otto border border-borde bg-lino px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <label htmlFor={`motivo-cierre-${fecha}`} className="text-grafito md:text-[13px]">
          Motivo
        </label>
        <input
          id={`motivo-cierre-${fecha}`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Feriado, inventario…"
          className="min-w-[160px] flex-1 rounded-otto border border-borde px-3 py-2 text-[14px] outline-none focus:border-cobre"
        />
        <button type="button" onClick={() => cerrar(false)} disabled={enviando} className="rounded-otto bg-cobre px-3.5 py-2 text-[14px] font-medium text-lino disabled:opacity-50">
          {enviando ? 'Cerrando…' : 'Cerrar este día'}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setTurnosAfectados(null);
            setError(null);
          }}
          className="text-[14px] text-grafito underline-offset-2 hover:underline md:text-[13px]"
        >
          Cancelar
        </button>
      </div>
      {turnosAfectados !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-otto border border-ambar bg-ambar-suave px-3 py-2 text-[14px] text-ambar">
          <span className="flex-1">
            Este día ya tiene {turnosAfectados} turno{turnosAfectados === 1 ? '' : 's'}. Cerrarlo no los cancela y a esos clientes no les llega
            ningún aviso: hay que llamarlos para pasarlos a otro día.
          </span>
          <button type="button" onClick={() => cerrar(true)} disabled={enviando} className="flex-none rounded-otto border border-ambar bg-lino px-3 py-1.5 text-[14px] font-medium text-ambar disabled:opacity-50">
            {enviando ? 'Cerrando…' : 'Cerrar igual'}
          </button>
        </div>
      )}
      {error && <div className="text-[13px] text-ladrillo">{error}</div>}
    </div>
  );
}
