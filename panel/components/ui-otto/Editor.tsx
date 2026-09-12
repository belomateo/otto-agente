'use client';

// Editor — Guardar · Deshacer · Versión anterior. Ver DISENO.md § componentes, 6.
// Convención del panel entero (H1.9): toda tabla editable deja versión +
// editado_por + editado_at, y el borde cobre avisa "hay cambios sin guardar".
// Este componente es el molde visual; la lógica de guardado real llega en Fase 2.

import { useState } from 'react';

export function EditorTexto({
  label,
  valorInicial,
  multiline = false,
  onGuardar,
}: {
  label: string;
  valorInicial: string;
  multiline?: boolean;
  onGuardar?: (valor: string) => void;
}) {
  const [valor, setValor] = useState(valorInicial);
  const sucio = valor !== valorInicial;
  const Campo = multiline ? 'textarea' : 'input';

  return (
    <div className="rounded-otto border border-borde bg-lino p-5">
      <div className="mb-2 text-[13px] font-medium text-grafito">{label}</div>
      <Campo
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        rows={multiline ? 3 : undefined}
        className={`w-full resize-none rounded-otto border px-3 py-2.5 text-[14.5px] leading-[1.5] text-tinta outline-none ${
          sucio ? 'border-cobre' : 'border-borde'
        }`}
      />
      <div className="mt-3 flex items-center gap-2.5">
        <button
          onClick={() => onGuardar?.(valor)}
          className="rounded-otto bg-cobre px-[18px] py-2.5 text-sm font-medium text-lino"
        >
          Guardar
        </button>
        <button
          onClick={() => setValor(valorInicial)}
          className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito"
        >
          Deshacer
        </button>
        <a className="ml-auto cursor-pointer text-[13px] text-tinta underline-offset-2 hover:underline">
          Ver versión anterior
        </a>
      </div>
      {sucio && (
        <div className="mt-2.5 border-t border-borde-suave pt-2.5 text-xs text-grafito">
          Borde cobre = hay cambios sin guardar.
        </div>
      )}
    </div>
  );
}
