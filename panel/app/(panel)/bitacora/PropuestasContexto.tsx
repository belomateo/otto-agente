'use client';

// Estado de las propuestas mientras son mock: vive en el layout de Bitácora para
// que el número de la subpestaña («Propuestas · N») y la lista se enteren juntos
// de cada Aplicar / Descartar / Deshacer, y para que no se pierda al pasar de
// Actividad a Propuestas. En Fase 2 lo reemplaza la tabla propuestas_mejora.

import { createContext, useContext, useState } from 'react';
import { PROPUESTAS, type EstadoPropuesta, type Propuesta } from './propuestas/propuestas-mock';

type Contexto = {
  propuestas: Propuesta[];
  pendientes: number;
  cambiarEstado: (id: string, estado: EstadoPropuesta) => void;
  cambiarSugerido: (id: string, texto: string) => void;
};

const PropuestasCtx = createContext<Contexto | null>(null);

export function PropuestasProvider({ children }: { children: React.ReactNode }) {
  const [propuestas, setPropuestas] = useState(PROPUESTAS);

  const actualizar = (id: string, cambio: Partial<Propuesta>) =>
    setPropuestas((lista) => lista.map((p) => (p.id === id ? { ...p, ...cambio } : p)));

  return (
    <PropuestasCtx.Provider
      value={{
        propuestas,
        pendientes: propuestas.filter((p) => p.estado === 'pendiente').length,
        cambiarEstado: (id, estado) => actualizar(id, { estado }),
        cambiarSugerido: (id, sugerido) => actualizar(id, { sugerido }),
      }}
    >
      {children}
    </PropuestasCtx.Provider>
  );
}

export function usePropuestas() {
  const ctx = useContext(PropuestasCtx);
  if (!ctx) throw new Error('usePropuestas va adentro de PropuestasProvider (app/(panel)/bitacora/layout.tsx)');
  return ctx;
}
