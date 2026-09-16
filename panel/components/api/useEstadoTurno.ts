'use client';

// Cambiar el estado de un turno (PROCESOS.md § 2, "En el local" y "Retiro y devolución"):
// PATCH /api/turnos/<id> con {version, estado, motivo_cancelacion?} (lib/edicion/entidades.ts,
// `turnos`). El servidor valida la transición (409 si no es válida) y exige un motivo para
// cancelar (400 si falta); acá solo se manda y se muestra lo que responda.

import { useState } from 'react';
import { enviar, ErrorApi } from './cliente';
import type { FilaTurno } from '@/lib/queries/turnos';

export function useEstadoTurno(turno: FilaTurno, onCambio: () => void) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiarEstado(estado: string, motivo_cancelacion?: string) {
    setEnviando(true);
    setError(null);
    try {
      await enviar(`/api/turnos/${turno.id}`, 'PATCH', {
        version: turno.version,
        estado,
        ...(motivo_cancelacion !== undefined ? { motivo_cancelacion } : {}),
      });
      onCambio();
      return true;
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return { enviando, error, cambiarEstado };
}
