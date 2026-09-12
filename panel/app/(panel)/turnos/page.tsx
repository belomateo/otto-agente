// Turnos — vista día, turno abierto con acceso a la charla, corte 14–15.
// Puerto de d-turnos.html (grilla por probador, geometría absoluta calcada
// del diseño) y m-turnos.html + m-turno-abierto.html (lista + hoja inferior).

import { BloqueTurno } from '@/components/ui-otto/BloqueTurno';
import { turnosM } from '@/lib/mock-data';

const HORAS = ['9:30', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const HORAS_TOP = [-2, 38, 118, 198, 278, 358, 438, 518, 598, 678];

export default function TurnosPage() {
  return (
    <>
      {/* Escritorio — grilla por probador, geometría 1:1 con el diseño */}
      <div className="hidden flex-1 flex-col px-6 pt-5.5 md:flex">
        <div className="mb-4 flex items-center gap-3.5">
          <div className="font-serif text-[22px] font-semibold">Turnos</div>
          <div className="text-sm text-grafito">Sábado 12 de septiembre</div>
          <div className="flex overflow-hidden rounded-otto border border-borde text-[13px] font-medium">
            <span className="bg-cobre px-4 py-[7px] text-lino">Día</span>
            <span className="bg-lino px-4 py-[7px] text-grafito">Semana</span>
          </div>
          <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[12.5px] font-medium text-ambar">
            Sin confirmar para mañana · 3
          </span>
          <div className="flex-1" />
          <button className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">Nuevo turno</button>
        </div>

        <div className="flex border-b border-borde pb-2 text-xs font-semibold uppercase tracking-[.05em] text-grafito">
          <div className="w-14 flex-none" />
          <div className="flex-1 text-center">Probador 1</div>
          <div className="flex-1 text-center">Probador 2</div>
          <div className="flex-1 text-center">Probador 3</div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="relative w-14 flex-none font-sans text-[11px] tabular-nums text-grafito">
              {HORAS.map((h, i) => (
                <span key={h} className="absolute" style={{ top: HORAS_TOP[i] }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Probador 1 */}
            <div className="relative flex-1 border-l border-[#EFEBE2]">
              <div className="absolute inset-x-0 top-[360px] flex h-20 items-center justify-center bg-[#EFEBE3] text-[11px] font-medium tracking-[.05em] text-[#9A968C]">
                CERRADO 14–15
              </div>
              <div className="absolute inset-x-1.5" style={{ top: 40 }}>
                <BloqueTurno nombre="Franco Bertolini" detalle="Novio · 45’ · Confirmado" estado="confirmado" />
              </div>
              <div className="absolute inset-x-1.5" style={{ top: 220 }}>
                <BloqueTurno nombre="Tomás Díaz" detalle="Graduado · 45’ · Confirmado" estado="confirmado" />
              </div>
            </div>

            {/* Probador 2 */}
            <div className="relative flex-1 border-l border-[#EFEBE2]">
              <div className="absolute inset-x-0 top-[360px] h-20 bg-[#EFEBE3]" />
              <div className="absolute inset-x-1.5" style={{ top: 60 }}>
                <BloqueTurno nombre="Nicolás Pereyra" detalle="Invitado · 45’ · Sin confirmar" estado="con-aviso" avisoTexto="Sin sincronizar con Google Calendar" />
              </div>
              <div className="absolute inset-x-1.5 flex h-[22px] items-center gap-2 overflow-hidden rounded-bloque border border-borde bg-lino px-2.5" style={{ top: 520, borderLeft: '3px solid #5E7F62' }}>
                <span className="font-serif text-[12.5px] font-semibold">Lucas Amado</span>
                <span className="text-[11px] text-grafito">Prueba final · 15’</span>
              </div>
            </div>

            {/* Probador 3 */}
            <div className="relative flex-1 border-l border-[#EFEBE2]">
              <div className="absolute inset-x-0 top-[360px] h-20 bg-[#EFEBE3]" />
              <div className="absolute inset-x-1.5" style={{ top: 160 }}>
                <BloqueTurno nombre="Martín Sosa" detalle="Invitado · 45’ · Confirmado" estado="confirmado" />
              </div>
            </div>
          </div>

          {/* Popover del turno seleccionado — Franco Bertolini, fijo como en el diseño */}
          <div className="absolute z-10 w-[300px] rounded-otto border border-borde bg-lino p-4 shadow-otto-pop" style={{ left: 90, top: 112 }}>
            <div className="font-serif text-lg font-semibold">Franco Bertolini</div>
            <div className="mt-0.5 text-[13px] leading-[1.5] text-grafito">
              Novio · Casamiento 14/11 · Noche · Talle 50
              <br />
              341 615-2233 · sáb 10:00 · Probador 1
            </div>
            <div className="my-3.5 flex items-center gap-1 text-[11.5px] font-medium">
              <span className="rounded-pill bg-salvia-suave px-2.5 py-1 text-salvia">Confirmado</span>
              <span className="text-[#C9C4B9]">→</span>
              <span className="rounded-pill border border-dashed border-[#D8D2C6] px-2.5 py-1 text-grafito">Alquiló</span>
              <span className="text-[#C9C4B9]">→</span>
              <span className="rounded-pill border border-dashed border-[#D8D2C6] px-2.5 py-1 text-grafito">Retiró</span>
              <span className="text-[#C9C4B9]">→</span>
              <span className="rounded-pill border border-dashed border-[#D8D2C6] px-2.5 py-1 text-grafito">Devolvió</span>
            </div>
            <button className="mb-2 w-full rounded-otto border border-cobre bg-lino py-2.5 text-[13px] font-medium text-cobre">
              Abrir la charla de WhatsApp
            </button>
            <div className="flex gap-2">
              <button className="flex-1 rounded-otto border border-borde bg-lino py-2 text-[13px] font-medium">Mover</button>
              <button className="flex-1 rounded-otto border border-borde bg-lino py-2 text-[13px] font-medium text-ladrillo">
                Cancelar
              </button>
              <button className="flex-1 rounded-otto bg-cobre py-2 text-[13px] font-medium text-lino">Marcar alquiló</button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile — lista del día + hoja del turno abierto */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-3 pt-[18px]">
          <div className="flex items-center">
            <div className="flex-1">
              <div className="font-serif text-[22px] font-semibold">Turnos</div>
              <div className="mt-0.5 text-[13px] text-grafito">Sábado 12 de septiembre</div>
            </div>
            <button className="rounded-otto bg-cobre px-3.5 py-2.5 text-[13px] font-medium text-lino">Nuevo</button>
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[12.5px] font-medium text-ambar">
              Sin confirmar mañana · 3
            </span>
            <span className="rounded-pill border border-borde px-3 py-1.5 text-[12.5px] font-medium text-grafito">Semana</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4">
          {turnosM.map((t) => (
            <div
              key={t.n}
              className="flex items-center gap-3 rounded-otto border border-borde bg-lino px-3.5 py-[13px]"
              style={{ borderLeft: `3px solid ${t.borde}` }}
            >
              <span className="w-[46px] flex-none font-serif text-[15px] font-semibold tabular-nums">{t.h}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-[15px] font-semibold">{t.n}</div>
                <div className="text-[12.5px] text-grafito">
                  {t.t} · {t.p}
                </div>
              </div>
              <span className="flex-none rounded-pill px-[9px] py-[3px] text-[11.5px] font-medium" style={{ background: t.eb, color: t.ef }}>
                {t.e}
              </span>
            </div>
          ))}
        </div>

        {/* Hoja del turno abierto, siempre visible acá para mostrar el patrón "marcar con una mano" */}
        <div className="rounded-t-2xl bg-lino px-[18px] pb-[30px] pt-5 shadow-otto-pop">
          <div className="mx-auto mb-4 h-1 w-9 rounded-pill bg-borde" />
          <div className="flex items-baseline gap-2.5">
            <span className="flex-1 font-serif text-xl font-semibold">Franco Bertolini</span>
            <span className="rounded-pill bg-salvia-suave px-2.5 py-[3px] text-[11.5px] font-medium text-salvia">
              Confirmado
            </span>
          </div>
          <div className="mt-1 text-[13.5px] leading-[1.5] text-grafito">
            Novio · Casamiento 14/11 · Noche · Talle 50
            <br />
            sáb 10:00 · 45’ · Probador 1 · 341 615-2233
          </div>
          <div className="mt-4.5 flex flex-col gap-2">
            <button className="rounded-otto bg-cobre py-3 text-[15px] font-medium text-lino">Marcar alquiló</button>
            <button className="rounded-otto border border-cobre bg-lino py-3 text-sm font-medium text-cobre">Abrir la charla</button>
            <div className="flex gap-2">
              <button className="flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium">Mover</button>
              <button className="flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium text-ladrillo">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
