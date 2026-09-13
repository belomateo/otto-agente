'use client';

// Configuración › Agenda (DISENO.md § 8, PROCESOS.md § 5). Horarios por día,
// corte, probadores, duraciones por tipo de turno y escalonado. Lo que se edita
// acá son los datos; las reglas sobre esos datos (qué hueco es válido) son
// código de logica (H1.13). Mock hasta Fase 2.

import { Switch } from '@/components/ui-otto/Switch';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';
import { AccionesEdicion, TARJETA } from '../AccionesEdicion';
import { AGENDA, type ConfigAgenda } from './agenda-mock';

const HORA = 'w-[76px] rounded-otto border border-borde bg-lino px-2 py-2 text-center text-[15px] tabular-nums outline-none focus:border-cobre';
const TITULO = 'mb-2.5 text-[14px] font-medium text-grafito md:text-[13px]';

function formatoDuracion(minutos: number) {
  if (!Number.isFinite(minutos) || minutos <= 0) return '—';
  if (minutos < 60) return `${minutos}’`;
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
}

export default function AgendaPage() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador<ConfigAgenda>(AGENDA);
  const { toast, mostrar, cerrar } = useToast();

  const cambiarDia = (i: number, cambio: Partial<ConfigAgenda['dias'][number]>) =>
    setValor({ ...valor, dias: valor.dias.map((d, j) => (j === i ? { ...d, ...cambio } : d)) });

  const cambiarDuracion = (i: number, minutos: number) =>
    setValor({ ...valor, duraciones: valor.duraciones.map((d, j) => (j === i ? { ...d, minutos } : d)) });

  return (
    <>
      <div className={TARJETA}>
        <div className={TITULO}>Horario por día</div>
        {valor.dias.map((d, i) => (
          <div key={d.dia} className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-borde-suave py-2">
            <span className="w-[84px] flex-none text-[15px] font-medium">{d.dia}</span>
            <Switch
              size="sm"
              checked={d.abierto}
              ariaLabel={`${d.dia} abierto`}
              onChange={(abierto) =>
                cambiarDia(i, abierto ? { abierto, desde: d.desde || '10:00', hasta: d.hasta || '19:00' } : { abierto })
              }
            />
            {d.abierto ? (
              <span className="flex items-center gap-2 text-[14px] text-grafito">
                <input value={d.desde} onChange={(e) => cambiarDia(i, { desde: e.target.value })} aria-label={`${d.dia} desde`} className={HORA} />
                a
                <input value={d.hasta} onChange={(e) => cambiarDia(i, { hasta: e.target.value })} aria-label={`${d.dia} hasta`} className={HORA} />
              </span>
            ) : (
              <span className="text-[14px] text-grafito">Cerrado</span>
            )}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3.5`}>
        <div className={TARJETA}>
          <div className={TITULO}>Corte (todos los probadores)</div>
          <div className="flex items-center gap-2 text-[14px] text-grafito">
            <input
              value={valor.corte.desde}
              onChange={(e) => setValor({ ...valor, corte: { ...valor.corte, desde: e.target.value } })}
              aria-label="Corte desde"
              className={HORA}
            />
            a
            <input
              value={valor.corte.hasta}
              onChange={(e) => setValor({ ...valor, corte: { ...valor.corte, hasta: e.target.value } })}
              aria-label="Corte hasta"
              className={HORA}
            />
          </div>
        </div>
        <div className={TARJETA}>
          <label htmlFor="probadores" className={`block ${TITULO}`}>
            Probadores
          </label>
          <input
            id="probadores"
            inputMode="numeric"
            value={valor.probadores}
            onChange={(e) => setValor({ ...valor, probadores: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            className={HORA}
          />
        </div>
        <div className={TARJETA}>
          <label htmlFor="escalonado" className={`block ${TITULO}`}>
            Escalonado entre probadores
          </label>
          <span className="flex items-center gap-2 text-[14px] text-grafito">
            <input
              id="escalonado"
              inputMode="numeric"
              value={valor.escalonado}
              onChange={(e) => setValor({ ...valor, escalonado: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              className={HORA}
            />
            min
          </span>
        </div>
      </div>

      <div className={TARJETA}>
        <div className={TITULO}>Duración por tipo de turno</div>
        {valor.duraciones.map((d, i) => (
          <div key={d.tipo} className="flex min-h-[52px] items-center gap-3 border-t border-borde-suave py-2">
            <span className="min-w-0 flex-1 text-[15px]">{d.tipo}</span>
            <input
              inputMode="numeric"
              value={d.minutos}
              onChange={(e) => cambiarDuracion(i, Number(e.target.value.replace(/\D/g, '')) || 0)}
              aria-label={`Duración de ${d.tipo} en minutos`}
              className={HORA}
            />
            <span className="w-[76px] flex-none text-[14px] text-grafito">
              min · <span className="tabular-nums text-tinta">{formatoDuracion(d.minutos)}</span>
            </span>
          </div>
        ))}
      </div>

      <AccionesEdicion
        sucio={sucio}
        onDeshacer={deshacer}
        onGuardar={() => mostrar({ texto: 'Guardado · Lucía lo usa en el próximo cálculo de huecos', onAccion: guardar() })}
      />
      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </>
  );
}
