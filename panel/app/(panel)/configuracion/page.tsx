'use client';

// Configuración › Lucía — avatar, presentación, contexto, reglas numeradas y el
// prompt base plegado. Puerto de d-config.html y m-config.html en un solo layout
// responsive. El toast «Guardado» aparece al tocar Guardar, no al abrir. Mock:
// en Fase 2, guardar escribe reglas_agente / contexto_agente y regenera el prompt.

import { useState } from 'react';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';
import { reglas as REGLAS } from '@/lib/mock-data';
import { AccionesEdicion, CAMPO, ETIQUETA, TARJETA } from './AccionesEdicion';

const INICIAL = {
  presentacion: 'Hola, soy Lucía, asistente de Mr. Otto. ¿En qué puedo ayudarte hoy?',
  contexto:
    'Trabajás en Otto Su Misura, el alquiler de trajes a medida de Mr. Otto (Rosario, desde 1968). Hablás en rioplatense, cálida y concreta. Tu objetivo es entender el evento y agendar una prueba en el local.',
  reglas: REGLAS.map((r) => r.t),
};

// Borrador de ejemplo: el prompt real lo genera scripts/armar-prompt.mjs (H1.3, rol agente).
const PROMPT_BASE = [
  'Lucía',
  '',
  'Sos Lucía, la asistente de WhatsApp del alquiler de trajes de Otto Su Misura.',
  'Antes de afirmar una política, un precio o un horario, consultás la herramienta que corresponde.',
  'Las reglas numeradas, el contexto y las notas del dueño se agregan abajo al generar el prompt.',
].join('\n');

function validarPrompt(texto: string): string | null {
  if (texto.includes('{{') || texto.includes('[[')) return 'No se guardó: el prompt tiene «{{» o «[[» sin reemplazar.';
  if (texto.split('\n').length > 300) return 'No se guardó: el prompt pasa de 300 líneas.';
  if (!texto.trim()) return 'No se guardó: el prompt está vacío.';
  return null;
}

function TarjetaLucia() {
  return (
    <div className={`flex items-center gap-3 md:gap-4 ${TARJETA}`}>
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-pill bg-noche font-serif text-xl font-semibold text-hueso md:h-14 md:w-14 md:text-[26px]">
        L
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[15px] font-semibold md:text-[17px]">Lucía</div>
        <div className="text-[14px] text-grafito md:text-[13px]">Asistente de WhatsApp de Mr. Otto · alquiler</div>
      </div>
      <button type="button" className="hidden flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium text-grafito md:block md:text-[13px]">
        Cambiar avatar
      </button>
    </div>
  );
}

function PromptBase({ onGuardado }: { onGuardado: (error: string | null) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(PROMPT_BASE);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-otto border border-borde bg-lino">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-3.5 text-left md:px-4.5"
      >
        <span className="text-grafito" aria-hidden>
          {abierto ? '▾' : '▸'}
        </span>
        <span className="flex-1 text-sm font-medium">Avanzado: prompt base</span>
        <span className="basis-full text-[14px] text-grafito md:basis-auto md:text-xs">
          solo si sabés lo que hacés · «Validar y guardar» avisa en rojo si no pasa
        </span>
      </button>
      {abierto && (
        <div className="border-t border-borde-suave px-3.5 pb-4 pt-3 md:px-4.5">
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
            rows={8}
            aria-label="Prompt base"
            className={`w-full resize-y rounded-otto border px-3 py-2.5 font-mono text-[14px] leading-[1.55] outline-none md:text-[13px] ${
              error ? 'border-ladrillo' : 'border-borde'
            }`}
          />
          {error && <div className="mt-2 text-[14px] font-medium text-ladrillo md:text-[13px]">{error}</div>}
          <button
            type="button"
            onClick={() => {
              const e = validarPrompt(texto);
              setError(e);
              onGuardado(e);
            }}
            className="mt-2.5 rounded-otto border border-cobre bg-lino px-4 py-2.5 text-sm font-medium text-cobre"
          >
            Validar y guardar
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConfiguracionLuciaPage() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador(INICIAL);
  const { toast, mostrar, cerrar } = useToast();

  const cambiarRegla = (i: number, texto: string) =>
    setValor({ ...valor, reglas: valor.reglas.map((r, j) => (j === i ? texto : r)) });

  return (
    <>
      <TarjetaLucia />

      <div className={TARJETA}>
        <label htmlFor="presentacion" className={ETIQUETA}>
          Presentación — lo primero que dice en cada charla nueva
        </label>
        <input
          id="presentacion"
          value={valor.presentacion}
          onChange={(e) => setValor({ ...valor, presentacion: e.target.value })}
          className={CAMPO}
        />
      </div>

      <div className={TARJETA}>
        <label htmlFor="contexto" className={ETIQUETA}>
          Contexto — quién es, dónde trabaja, cómo habla
        </label>
        <textarea
          id="contexto"
          value={valor.contexto}
          onChange={(e) => setValor({ ...valor, contexto: e.target.value })}
          rows={4}
          className={`${CAMPO} resize-y leading-[1.6]`}
        />
      </div>

      <div className={TARJETA}>
        <div className="mb-2.5 flex items-center gap-2">
          <div className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">Reglas — Lucía las cumple siempre, en orden</div>
          <button
            type="button"
            onClick={() => setValor({ ...valor, reglas: [...valor.reglas, ''] })}
            className="flex-none rounded-[7px] border border-cobre bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre md:text-[12.5px]"
          >
            Agregar regla
          </button>
        </div>
        {valor.reglas.map((r, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-borde-suave py-2">
            <span className="w-[18px] flex-none font-serif text-sm font-semibold tabular-nums text-cobre">{i + 1}</span>
            <input
              value={r}
              onChange={(e) => cambiarRegla(i, e.target.value)}
              placeholder="Escribí la regla"
              aria-label={`Regla ${i + 1}`}
              className="min-w-0 flex-1 rounded-otto border border-transparent px-1.5 py-1 text-[14.5px] leading-[1.5] outline-none hover:border-borde focus:border-cobre"
            />
            <button
              type="button"
              onClick={() => setValor({ ...valor, reglas: valor.reglas.filter((_, j) => j !== i) })}
              aria-label={`Quitar la regla ${i + 1}`}
              className="flex-none px-1 text-[14px] text-[#A9A395]"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <PromptBase
        onGuardado={(error) =>
          error
            ? mostrar({ variante: 'error', texto: 'No pasó la validación: el prompt anterior sigue activo', accion: 'Cerrar' })
            : mostrar({ texto: 'Prompt validado y guardado · Lucía lo usa en menos de un minuto', accion: 'Cerrar' })
        }
      />

      <AccionesEdicion
        sucio={sucio}
        onDeshacer={deshacer}
        onGuardar={() => mostrar({ texto: 'Guardado · Lucía lo usa en el próximo mensaje', onAccion: guardar() })}
      />

      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </>
  );
}
