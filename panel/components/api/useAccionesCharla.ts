'use client';

// Acciones del día a día sobre una charla (PROCESOS.md § 4, pasos 6 y 7; paneles): tomar,
// devolver a Lucía, cerrar y responder desde el mostrador. Las 4 rutas viven bajo
// /api/bandeja/<id>/... aunque se llamen también desde Atención humana, porque la charla
// (conversación) es el mismo recurso lo mires desde la pestaña que lo mires.
// Un solo lugar para no repetir esto entre ChatThread.tsx y atencion/page.tsx.

import { useEffect, useState } from 'react';
import { enviar, ErrorApi } from './cliente';

export function useAccionesCharla(conversacionId: string | null) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si la pantalla cambia de charla (elegís otra derivación, otra fila de la bandeja) el error
  // de la charla anterior no tiene que quedar pegado.
  useEffect(() => {
    setError(null);
  }, [conversacionId]);

  async function correr(fn: (id: string) => Promise<unknown>): Promise<boolean> {
    if (!conversacionId) return false;
    setEnviando(true);
    setError(null);
    try {
      await fn(conversacionId);
      return true;
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar con el panel');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return {
    enviando,
    error,
    tomar: () => correr((id) => enviar(`/api/bandeja/${id}/tomar`, 'POST')),
    devolver: () => correr((id) => enviar(`/api/bandeja/${id}/devolver`, 'POST')),
    cerrar: () => correr((id) => enviar(`/api/bandeja/${id}/cerrar`, 'POST')),
    responder: (texto: string) => correr((id) => enviar(`/api/bandeja/${id}/mensajes`, 'POST', { texto })),
  };
}
