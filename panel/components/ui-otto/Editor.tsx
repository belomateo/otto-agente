'use client';

// Editor — Guardar · Deshacer · Versión anterior. Ver DISENO.md § componentes, 6.
// Convención del panel entero (H1.9): toda tabla editable deja versión +
// editado_por + editado_at, y el borde cobre avisa "hay cambios sin guardar".
// Este componente es el molde visual; la lógica de guardado real llega en Fase 2.

import { useState } from 'react';

export function EditorTexto({
  label,
  valorInicial,
  borradorInicial,
  multiline = false,
  onGuardar,
  onVersionAnterior,
}: {
  label: string;
  valorInicial: string;
  /** para arrancar ya con cambios sin guardar (galería, borradores restaurados) */
  borradorInicial?: string;
  multiline?: boolean;
  onGuardar?: (valor: string) => void;
  onVersionAnterior?: () => void;
}) {
  const [valor, setValor] = useState(borradorInicial ?? valorInicial);
  const sucio = valor !== valorInicial;
  const Campo = multiline ? 'textarea' : 'input';

  return (
    <div className="rounded-otto border border-borde bg-lino p-5">
      <div className="mb-2 text-[14px] font-medium text-grafito md:text-[13px]">{label}</div>
      <Campo
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        rows={multiline ? 3 : undefined}
        className={`w-full resize-none rounded-otto border px-3 py-2.5 text-[14.5px] leading-[1.5] text-tinta outline-none ${
          sucio ? 'border-cobre' : 'border-borde'
        }`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => onGuardar?.(valor)}
          className="rounded-otto bg-cobre px-[18px] py-2.5 text-sm font-medium text-lino"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setValor(valorInicial)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito"
        >
          Deshacer
        </button>
        <button
          type="button"
          onClick={onVersionAnterior}
          className="ml-auto text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]"
        >
          Ver versión anterior
        </button>
      </div>
      {sucio && (
        <div className="mt-2.5 border-t border-borde-suave pt-2.5 text-[14px] text-grafito md:text-xs">
          Borde cobre = hay cambios sin guardar.
        </div>
      )}
    </div>
  );
}
