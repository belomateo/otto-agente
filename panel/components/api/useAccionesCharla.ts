'use client';

// Acciones del día a día sobre una charla (PROCESOS.md § 4, pasos 6 y 7; paneles): tomar,
// devolver a Lucía, cerrar y responder desde el mostrador. Las 4 rutas viven bajo
// /api/bandeja/<id>/... aunque se llamen también desde Atención humana, porque la charla
// (conversación) es el mismo recurso lo mires desde la pestaña que lo mires.
// Un solo lugar para no repetir esto entre ChatThread.tsx y atencion/page.tsx.

import { useEffect, useState } from 'react';
import { enviar, ErrorApi } from './cliente';

// El motivo de mostrador_enviar (paneles): 'ventana_cerrada' (pasaron más de 24 hs desde el
// último mensaje del cliente) o 'no_tomada' (la charla no está tomada) — mismo 409, campo
// estable en vez de tener que buscar un texto adentro del mensaje de error.
function motivoDe(e: unknown): string | null {
  if (!(e instanceof ErrorApi)) return null;
  const d = e.detalle;
  return d && typeof d === 'object' && 'motivo' in d ? String((d as { motivo: unknown }).motivo) : null;
}

export function useAccionesCharla(conversacionId: string | null) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  // Si la pantalla cambia de charla (elegís otra derivación, otra fila de la bandeja) el error
  // de la charla anterior no tiene que quedar pegado.
  useEffect(() => {
    setError(null);
    setMotivo(null);
  }, [conversacionId]);

  async function correr(fn: (id: string) => Promise<unknown>): Promise<boolean> {
    if (!conversacionId) return false;
    setEnviando(true);
    setError(null);
    setMotivo(null);
    try {
      await fn(conversacionId);
      return true;
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar con el panel');
      setMotivo(motivoDe(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  // Multipart, no pasa por cliente.ts (enviar() solo manda JSON): mismo camino que
  // catalogo/EdicionModelo.tsx (SubirFoto) — subida + envío en un solo paso, del lado de
  // paneles (control 8, bucket `adjuntos`, no `catalogo`: ese es público y solo-admin).
  async function subirFoto(id: string, archivo: File) {
    const form = new FormData();
    form.append('archivo', archivo);
    const r = await fetch(`/api/bandeja/${id}/foto`, { method: 'POST', body: form });
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok) throw new ErrorApi(r.status, cuerpo?.error ?? 'No se pudo enviar la foto', cuerpo?.detalle);
    return cuerpo;
  }

  return {
    enviando,
    error,
    motivo,
    tomar: () => correr((id) => enviar(`/api/bandeja/${id}/tomar`, 'POST')),
    devolver: () => correr((id) => enviar(`/api/bandeja/${id}/devolver`, 'POST')),
    cerrar: () => correr((id) => enviar(`/api/bandeja/${id}/cerrar`, 'POST')),
    responder: (texto: string) => correr((id) => enviar(`/api/bandeja/${id}/mensajes`, 'POST', { texto })),
    enviarFoto: (archivo: File) => correr((id) => subirFoto(id, archivo)),
  };
}
