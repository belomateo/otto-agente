'use client';

// Un mensaje mínimo en el lugar (no flotante), para una fila o una tarjeta que ya tiene su
// propio layout y no necesita el patrón fijo de ToastFlotante para un aviso de una línea.

import { useState } from 'react';

export function useToastLocal() {
  const [msj, setMsj] = useState<{ texto: string; error: boolean } | null>(null);
  function mostrar(texto: string, error: boolean) {
    setMsj({ texto, error });
    setTimeout(() => setMsj(null), 4000);
  }
  const elemento = msj ? <div className={`mt-2 text-[14px] ${msj.error ? 'text-ladrillo' : 'text-salvia'}`}>{msj.texto}</div> : null;
  return { toast: elemento, mostrar };
}
