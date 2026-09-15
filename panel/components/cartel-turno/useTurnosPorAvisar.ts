'use client';

// Sondeo de GET /api/turnos/avisos (H1.16, paneles) cada 20 s (dentro del "30 s o menos" que
// pidió Mateo, decisión #10 del 15/9), y POST /api/turnos/<id>/ok para el botón OK.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvisoTurno } from './tipos';

const SONDEO_MS = 20_000;

export function useTurnosPorAvisar() {
  const [turnos, setTurnos] = useState<AvisoTurno[]>([]);
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

  const marcarOk = useCallback((id: string) => {
    ocultos.current.add(id);
    setTurnos((actuales) => actuales.filter((t) => t.id !== id));
    fetch(`/api/turnos/${id}/ok`, { method: 'POST' }).catch(() => {
      // Sin red: no hace falta reintentar acá. Un 409 (el turno ya salió de la ventana del
      // aviso: canceló, terminó, etc.) tampoco necesita más que esto: el próximo sondeo trae
      // el estado real, y si seguía pendiente por alguna razón, reaparece solo.
    });
  }, []);

  return { turnos, marcarOk };
}
