'use client';

// Sondeo de GET /api/turnos/avisos (H1.16, paneles) cada 20 s (dentro del "30 s o menos" que
// pidió Mateo, decisión #10 del 15/9), y POST /api/turnos/<id>/ok para el botón OK.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvisoTurno } from './tipos';

const SONDEO_MS = 20_000;

export function useTurnosPorAvisar() {
  const [turnos, setTurnos] = useState<AvisoTurno[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Ids con un OK en curso: se sacan de la lista al toque (antes de que responda el POST) para
  // que no haga falta esperar un sondeo entero a ver el efecto de tocar OK.
  const ocultos = useRef<Set<string>>(new Set());

  const sondear = useCallback(async () => {
    try {
      const r = await fetch('/api/turnos/avisos', { cache: 'no-store' });
      if (!r.ok) return; // 401/403 (sesión) o un error pasajero: se reintenta en el próximo sondeo.
      const datos: { aviso_turno_min: number | null; turnos: AvisoTurno[] } = await r.json();
      setTurnos(datos.turnos.filter((t) => !ocultos.current.has(t.id)));
    } catch {
      // Sin red: se reintenta en el próximo sondeo, sin romper lo que ya se venía mostrando.
    }
  }, []);

  useEffect(() => {
    sondear();
    const id = setInterval(sondear, SONDEO_MS);
    return () => clearInterval(id);
  }, [sondear]);

  // Si el POST no registró el OK de verdad (sin red, o el servidor lo rechazó por algo que no
  // sea "ya salió de la ventana del aviso"), sacarlo de `ocultos` es obligatorio: si no, queda
  // escondido para siempre — ni el próximo sondeo lo va a volver a traer, porque el filtro de
  // `sondear` lo sigue tachando. Un 409 sí se deja escondido: ahí el servidor ya confirmó que
  // no hace falta avisar más (canceló, terminó, etc.), no es una falla.
  const marcarOk = useCallback(
    (id: string) => {
      ocultos.current.add(id);
      setTurnos((actuales) => actuales.filter((t) => t.id !== id));
      setError(null);
      fetch(`/api/turnos/${id}/ok`, { method: 'POST' })
        .then((r) => {
          if (r.ok || r.status === 409) return;
          throw new Error('no ok');
        })
        .catch(() => {
          ocultos.current.delete(id);
          setError('No se pudo registrar el OK. Probá de nuevo.');
          sondear();
        });
    },
    [sondear]
  );

  return { turnos, error, marcarOk };
}
