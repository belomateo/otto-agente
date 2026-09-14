'use client';

// Estado de una edición del dueño mientras el panel es mock (Fase 1): lo que
// está en pantalla, lo último guardado, si hay cambios sin guardar y cómo volver
// atrás. En Fase 2, guardar() pasa a escribir en la base (H1.9, con versión e
// historial) y el "anterior" sale de ahí; la forma de usarlo no cambia.

import { useState } from 'react';

export function useBorrador<T>(inicial: T) {
  const [valor, setValor] = useState<T>(inicial);
  const [guardado, setGuardado] = useState<T>(inicial);
  const sucio = JSON.stringify(valor) !== JSON.stringify(guardado);

  /** Guarda lo que está en pantalla y devuelve la función que deshace ese guardado (para el Toast). */
  function guardar() {
    const anterior = guardado;
    setGuardado(valor);
    return () => {
      setGuardado(anterior);
      setValor(anterior);
    };
  }

  /** Descarta lo que no se guardó. */
  function deshacer() {
    setValor(guardado);
  }

  return { valor, setValor, sucio, guardar, deshacer };
}
