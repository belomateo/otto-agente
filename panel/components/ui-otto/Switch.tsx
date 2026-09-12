'use client';

// Switch con etiqueta. Ver DISENO.md § componentes, 7.
// Se usa para todo lo que Lucía "puede mostrar" (fragmentos, modelos del
// catálogo, accesorios): el dueño decide qué sabe el agente, en un toggle.

import { useState } from 'react';

export function Switch({
  label,
  defaultChecked = true,
  onChange,
  size = 'md',
}: {
  label?: string;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'md' | 'sm';
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const dims = size === 'sm' ? { w: 30, h: 18, knob: 14 } : { w: 34, h: 20, knob: 16 };

  const toggle = () => {
    const next = !checked;
    setChecked(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
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
