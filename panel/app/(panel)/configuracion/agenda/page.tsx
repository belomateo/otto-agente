'use client';

// Configuración › Agenda (DISENO.md § 8, PROCESOS.md § 5 y decisiones #7 y #9 del
// 14/9). Horario del local, franjas de turnos por día con su cantidad de probadores,
// probadores del local, escalonado, reserva para urgencias y duración por tipo de
// turno. Lo que se edita acá son los datos; las reglas sobre esos datos (qué hueco
// es válido) son código de logica (H1.13). Mock hasta Fase 2.

import { Switch } from '@/components/ui-otto/Switch';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';
import { AccionesEdicion, TARJETA } from '../AccionesEdicion';
import { AGENDA, type ConfigAgenda, type DiaAgenda, type Franja } from './agenda-mock';
import { aHora, aMinutos, erroresFranjas } from './franjas';

const HORA = 'w-[76px] rounded-otto border border-borde bg-lino px-2 py-2 text-center text-[15px] tabular-nums outline-none focus:border-cobre';
const NUMERO = 'w-[56px] rounded-otto border border-borde bg-lino px-2 py-2 text-center text-[15px] tabular-nums outline-none focus:border-cobre';
const TITULO = 'mb-2.5 text-[14px] font-medium text-grafito md:text-[13px]';
const NOTA = 'text-[14px] leading-[1.5] text-grafito md:text-[13px]';
const ERROR = 'text-[14px] font-medium text-ladrillo md:text-[13px]';

const soloNumero = (texto: string) => Number(texto.replace(/\D/g, '')) || 0;

function formatoDuracion(minutos: number) {
  if (!Number.isFinite(minutos) || minutos <= 0) return '—';
  if (minutos < 60) return `${minutos}’`;
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
}

// Una franja nueva arranca donde termina la última (o a la apertura) y dura una hora.
function franjaNueva(dia: DiaAgenda, probadores: number): Franja {
  const desde = dia.franjas[dia.franjas.length - 1]?.hasta || dia.desde || '10:00';
  const minutos = aMinutos(desde);
  return { desde, hasta: minutos === null ? '' : aHora(Math.min(minutos + 60, 23 * 60 + 59)), probadores };
}

export default function AgendaPage() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador<ConfigAgenda>(AGENDA);
  const { toast, mostrar, cerrar } = useToast();

  const cambiarDia = (i: number, cambio: Partial<DiaAgenda>) =>
    setValor({ ...valor, dias: valor.dias.map((d, j) => (j === i ? { ...d, ...cambio } : d)) });

  const cambiarFranja = (i: number, k: number, cambio: Partial<Franja>) =>
    cambiarDia(i, { franjas: valor.dias[i].franjas.map((f, j) => (j === k ? { ...f, ...cambio } : f)) });

  const cambiarDuracion = (i: number, minutos: number) =>
    setValor({ ...valor, duraciones: valor.duraciones.map((d, j) => (j === i ? { ...d, minutos } : d)) });

  const errores = valor.dias.map((d) => erroresFranjas(d.franjas, valor.probadores));
  const hayErrores = valor.probadores < 1 || errores.some((e) => e.length > 0);
  const reserva = valor.reservaUrgencia;

  return (
    <>
      <div className={TARJETA}>
        <div className={TITULO}>Horario del local</div>
        <p className={`mb-1.5 ${NOTA}`}>Para la atención del equipo y los avisos fuera de horario. Los turnos van aparte, por franjas.</p>
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

      <div className={TARJETA}>
        <div className={TITULO}>Turnos por día</div>
        <p className={`mb-1.5 ${NOTA}`}>
          Cada franja lleva su cantidad de probadores. Si tiene menos que el local, toman turnos los primeros: con 2, el Probador 1 y el 2.
        </p>
        {valor.dias.map((d, i) => (
          <div key={d.dia} className="flex flex-col gap-2 border-t border-borde-suave py-2.5 md:flex-row md:gap-3">
            <span className="flex-none text-[15px] font-medium md:w-[84px] md:pt-2">{d.dia}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {d.franjas.length === 0 && (
                <span className="text-[14px] text-grafito md:pt-2">{d.abierto ? 'Sin turnos' : 'Sin turnos · el local está cerrado'}</span>
              )}
              {d.franjas.map((f, k) => (
                <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex items-center gap-2 text-[14px] text-grafito">
                    <input
                      value={f.desde}
                      onChange={(e) => cambiarFranja(i, k, { desde: e.target.value })}
                      aria-label={`${d.dia}, franja ${k + 1}, desde`}
                      className={HORA}
                    />
                    a
                    <input
                      value={f.hasta}
                      onChange={(e) => cambiarFranja(i, k, { hasta: e.target.value })}
                      aria-label={`${d.dia}, franja ${k + 1}, hasta`}
                      className={HORA}
                    />
                  </span>
                  {/* A 390 «Quitar» queda en la línea de las horas y los probadores bajan; en escritorio, todo en una línea. */}
                  <button
                    type="button"
                    onClick={() => cambiarDia(i, { franjas: d.franjas.filter((_, j) => j !== k) })}
                    aria-label={`Quitar la franja de ${f.desde} a ${f.hasta} del ${d.dia.toLowerCase()}`}
                    className="order-2 ml-auto px-2 py-2.5 text-[14px] font-medium text-ladrillo md:order-3 md:text-[13px]"
                  >
                    Quitar
                  </button>
                  <span className="order-3 flex w-full items-center gap-2 text-[14px] text-grafito md:order-2 md:w-auto">
                    <input
                      inputMode="numeric"
                      value={f.probadores}
                      onChange={(e) => cambiarFranja(i, k, { probadores: soloNumero(e.target.value) })}
                      aria-label={`${d.dia}, franja ${k + 1}, probadores`}
                      className={NUMERO}
                    />
                    {f.probadores === 1 ? 'probador' : 'probadores'}
                  </span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => cambiarDia(i, { franjas: [...d.franjas, franjaNueva(d, valor.probadores)] })}
                className="self-start py-1.5 text-[14px] font-medium text-cobre md:text-[13px]"
              >
                + Agregar franja
              </button>
              {errores[i].map((e) => (
                <div key={e} className={ERROR}>
                  {e}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3.5">
        <div className={TARJETA}>
          <label htmlFor="probadores" className={`block ${TITULO}`}>
            Probadores del local
          </label>
          <input
            id="probadores"
            inputMode="numeric"
            value={valor.probadores}
            onChange={(e) => setValor({ ...valor, probadores: soloNumero(e.target.value) })}
            className={HORA}
          />
          <p className={`mt-2 ${valor.probadores < 1 ? ERROR : NOTA}`}>
            {valor.probadores < 1 ? 'El local necesita al menos 1 probador.' : 'Ninguna franja puede tener más.'}
          </p>
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
              onChange={(e) => setValor({ ...valor, escalonado: soloNumero(e.target.value) })}
              className={HORA}
            />
            min
          </span>
        </div>
        <div className={TARJETA}>
          <label htmlFor="reserva" className={`block ${TITULO}`}>
            Reserva para urgencias
          </label>
          <span className="flex items-center gap-2 text-[14px] text-grafito">
            <input
              id="reserva"
              inputMode="numeric"
              value={reserva ?? ''}
              placeholder="—"
              onChange={(e) => {
                const digitos = e.target.value.replace(/\D/g, '');
                setValor({ ...valor, reservaUrgencia: digitos === '' ? null : Number(digitos) });
              }}
              className={HORA}
            />
            días
          </span>
          <p className={`mt-2 ${NOTA}`}>
            {reserva
              ? `Los turnos de los próximos ${reserva} ${reserva === 1 ? 'día' : 'días'} quedan para eventos dentro de ese plazo; a un evento más lejano Lucía le ofrece desde el día ${reserva + 1}. Vacío: sin reserva.`
              : 'Sin reserva: Lucía ofrece el primer hueco libre a cualquier evento.'}
          </p>
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
              onChange={(e) => cambiarDuracion(i, soloNumero(e.target.value))}
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
        onGuardar={() =>
          hayErrores
            ? mostrar({ variante: 'error', texto: 'Hay franjas con problemas: no se guardó y Lucía sigue con la agenda anterior', accion: 'Cerrar' })
            : mostrar({ texto: 'Guardado · Lucía lo usa en el próximo cálculo de huecos', onAccion: guardar() })
        }
      />
      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </>
  );
}
