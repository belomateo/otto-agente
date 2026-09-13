'use client';

// Switch con etiqueta. Ver DISENO.md § componentes, 7.
// Se usa para todo lo que Lucía "puede mostrar" (fragmentos, modelos del
// catálogo, accesorios, herramientas): el dueño decide qué sabe el agente, en
// un toggle. Sin `checked` maneja su propio estado; con `checked` lo maneja
// quien lo usa (hace falta para que "Deshacer" lo vuelva atrás).

import { useState } from 'react';

export function Switch({
  label,
  checked: controlado,
  defaultChecked = true,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'md' | 'sm';
  /** nombre para lectores de pantalla cuando no hay etiqueta visible */
  ariaLabel?: string;
}) {
  const [interno, setInterno] = useState(defaultChecked);
  const checked = controlado ?? interno;
  const dims = size === 'sm' ? { w: 30, h: 18, knob: 14 } : { w: 34, h: 20, knob: 16 };

  const toggle = () => {
    const next = !checked;
    if (controlado === undefined) setInterno(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      onClick={toggle}
      className={`flex items-center gap-2.5 text-sm font-medium ${checked ? 'text-tinta' : 'text-grafito'}`}
    >
      <span
        className="relative inline-block flex-none rounded-pill transition-colors"
        style={{
          width: dims.w,
          height: dims.h,
          background: checked ? '#A8703F' : '#D8D2C6',
        }}
      >
        <span
          className="absolute top-0.5 rounded-pill bg-lino transition-all"
          style={{
            width: dims.knob,
            height: dims.knob,
            left: checked ? dims.w - dims.knob - 2 : 2,
          }}
        />
      </span>
      {label}
    </button>
  );
}
