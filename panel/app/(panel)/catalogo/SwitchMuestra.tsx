'use client';

// Switch «Lucía lo muestra» de cada modelo: la etiqueta acompaña al estado.

import { useState } from 'react';
import { Switch } from '@/components/ui-otto/Switch';

export function SwitchMuestra({ inicial, nombre, conEtiqueta = true }: { inicial: boolean; nombre: string; conEtiqueta?: boolean }) {
  const [muestra, setMuestra] = useState(inicial);
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-grafito md:text-[11.5px]">
      {conEtiqueta && (muestra ? 'Lucía lo muestra' : 'No lo muestra')}
      <Switch size="sm" checked={muestra} onChange={setMuestra} ariaLabel={`Lucía muestra ${nombre}`} />
    </span>
  );
}
