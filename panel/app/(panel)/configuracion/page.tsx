'use client';

// Configuración — subpestaña Lucía, con toast de guardado. Puerto de
// d-config.html y m-config.html. Las otras subpestañas (Agenda, Herramientas,
// Enlaces, Notas, Accesos) son de otros roles — ver STACK.md § 6 y H1.10.

import { useState } from 'react';
import { Toast } from '@/components/ui-otto/Toast';
import { reglas } from '@/lib/mock-data';

const SUBPESTAÑAS_DESKTOP = ['Lucía', 'Agenda', 'Herramientas', 'Enlaces', 'Notas', 'Accesos'];
const SUBPESTAÑAS_MOBILE = ['Lucía', 'Agenda', 'Herram.', 'Enlaces', 'Notas'];

function TarjetaLucia({ compacta = false }: { compacta?: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-otto border border-borde bg-lino ${compacta ? 'gap-3 p-3.5' : 'p-4.5'}`}>
      <div
        className={`flex flex-none items-center justify-center rounded-pill bg-noche font-serif font-semibold text-hueso ${
          compacta ? 'h-11 w-11 text-xl' : 'h-14 w-14 text-[26px]'
        }`}
      >
        L
      </div>
      <div className="flex-1">
        <div className={`font-serif font-semibold ${compacta ? 'text-[15px]' : 'text-[17px]'}`}>Lucía</div>
        <div className={compacta ? 'text-xs text-grafito' : 'text-[13px] text-grafito'}>
          {compacta ? 'Asistente de WhatsApp de Mr. Otto' : 'Asistente de WhatsApp de Mr. Otto · atendiendo desde marzo 2026'}
        </div>
      </div>
      {!compacta && (
        <button className="flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[13px] font-medium text-grafito">
          Cambiar avatar
        </button>
      )}
    </div>
  );
}

export default function ConfiguracionPage() {
  const [guardado, setGuardado] = useState(true);

  return (
    <>
      {/* Escritorio */}
      <div className="relative hidden flex-1 flex-col px-7 py-5.5 md:flex">
        <div className="mb-3.5 font-serif text-[22px] font-semibold">Configuración</div>
        <div className="mb-5 flex gap-0.5 border-b border-borde text-sm font-medium">
          {SUBPESTAÑAS_DESKTOP.map((s, i) => (
            <span
              key={s}
              className={i === 0 ? '-mb-px border-b-2 border-cobre px-4 py-2.5 text-cobre' : 'px-4 py-2.5 text-grafito'}
            >
              {s}
              {s === 'Accesos' && (
                <span className="ml-0.5 rounded-pill bg-ladrillo px-[7px] py-px text-[11px] font-semibold text-lino">1</span>
              )}
            </span>
          ))}
        </div>
        <div className="flex max-w-[820px] flex-col gap-3.5">
          <TarjetaLucia />
          <div className="rounded-otto border border-borde bg-lino p-4.5">
            <div className="mb-2 text-[13px] font-medium text-grafito">Presentación — lo primero que dice en cada charla nueva</div>
            <input
              defaultValue="Hola, soy Lucía, asistente de Mr. Otto. ¿En qué puedo ayudarte hoy?"
              className="w-full rounded-otto border border-borde px-3 py-2.5 text-[15px] outline-none"
            />
          </div>
          <div className="rounded-otto border border-borde bg-lino p-4.5">
            <div className="mb-2 text-[13px] font-medium text-grafito">Contexto — quién es, dónde trabaja, cómo habla</div>
            <textarea
              defaultValue="Trabajás en Otto Su Misura, el alquiler de trajes a medida de Mr. Otto (Rosario, desde 1968). Hablás en rioplatense, cálida y concreta. Tu objetivo es entender el evento y agendar una prueba en el local."
              className="min-h-[88px] w-full resize-none rounded-otto border border-borde px-3 py-2.5 text-[14.5px] leading-[1.6] outline-none"
            />
          </div>
          <div className="rounded-otto border border-borde bg-lino p-4.5">
            <div className="mb-2.5 flex items-center">
              <div className="flex-1 text-[13px] font-medium text-grafito">Reglas — Lucía las cumple siempre, en orden</div>
              <button className="rounded-[7px] border border-cobre bg-lino px-3 py-1.5 text-[12.5px] font-medium text-cobre">
                Agregar regla
              </button>
            </div>
            {reglas.map((r) => (
              <div key={r.i} className="flex items-center gap-3 border-t border-borde-suave py-2.5">
                <span className="w-[18px] flex-none font-serif text-sm font-semibold tabular-nums text-cobre">{r.i}</span>
                <span className="flex-1 text-[14.5px] leading-[1.5]">{r.t}</span>
                <span className="cursor-pointer text-[13px] text-[#C9C4B9]">✕</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 rounded-otto border border-borde bg-lino px-4.5 py-3.5">
            <span className="text-grafito">▸</span>
            <span className="flex-1 text-sm font-medium">Avanzado: prompt base</span>
            <span className="text-xs text-grafito">solo si sabés lo que hacés · «Validar y guardar» avisa en rojo si no pasa</span>
          </div>
          <div className="flex items-center gap-2.5 pb-[70px]">
            <button onClick={() => setGuardado(true)} className="rounded-otto bg-cobre px-5 py-2.5 text-sm font-medium text-lino">
              Guardar
            </button>
            <button className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">
              Deshacer
            </button>
            <a className="ml-auto cursor-pointer text-[13px]">Ver versión anterior</a>
          </div>
        </div>
        {guardado && (
          <div className="absolute bottom-6 right-7">
            <Toast texto="Guardado · Lucía lo usa en el próximo mensaje" accion="Deshacer" />
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pt-[18px]">
          <div className="font-serif text-[22px] font-semibold">Configuración</div>
          <div className="mt-2.5 flex gap-0.5 overflow-hidden border-b border-borde text-[13.5px] font-medium">
            {SUBPESTAÑAS_MOBILE.map((s, i) => (
              <span
                key={s}
                className={
                  i === 0
                    ? '-mb-px flex-none border-b-2 border-cobre px-3 py-2.5 text-cobre'
                    : 'flex-none px-3 py-2.5 text-grafito'
                }
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <TarjetaLucia compacta />
          <div className="rounded-otto border border-borde bg-lino p-3.5">
            <div className="mb-1.5 text-[12.5px] font-medium text-grafito">Presentación</div>
            <div className="rounded-otto border border-borde px-3 py-2.5 text-sm leading-[1.5]">
              Hola, soy Lucía, asistente de Mr. Otto. ¿En qué puedo ayudarte hoy?
            </div>
          </div>
          <div className="rounded-otto border border-borde bg-lino p-3.5">
            <div className="mb-1.5 flex items-center">
              <div className="flex-1 text-[12.5px] font-medium text-grafito">Reglas</div>
              <span className="text-xs font-medium text-cobre">Agregar</span>
            </div>
            {reglas.map((r) => (
              <div key={r.i} className="flex gap-2.5 border-t border-borde-suave py-2.5 text-[13.5px] leading-[1.45]">
                <span className="flex-none font-serif text-[13px] font-semibold text-cobre">{r.i}</span>
                <span>{r.t}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setGuardado(true)} className="flex-1 rounded-otto bg-cobre py-3 text-sm font-medium text-lino">
              Guardar
            </button>
            <button className="flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium text-grafito">
              Deshacer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
