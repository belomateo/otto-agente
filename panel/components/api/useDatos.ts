'use client';

// Hook de lectura para las pestañas conectadas a panel/app/api/**: pide, guarda estado de
// carga/error, y permite recargar (después de una acción, o por sondeo). `ruta` en null
// pausa el pedido (por ejemplo, mientras todavía no se sabe qué día mostrar).

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi, obtener } from './cliente';

// El panel suele quedar abierto en el mostrador: sin sondeo, un mensaje nuevo o una derivación
// no se ven hasta refrescar a mano. Mismo intervalo que ya usa el cartel de turno
// (useTurnosPorAvisar) para Bandeja, Atención humana y una charla abierta.
export const SONDEO_LISTAS_MS = 20_000;

export function useDatos<T>(ruta: string | null, opciones: { sondeoMs?: number } = {}) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rutaActual = useRef(ruta);
  rutaActual.current = ruta;

  const recargar = useCallback(async () => {
    const r = rutaActual.current;
    if (!r) return;
    try {
      const d = await obtener<T>(r);
      if (rutaActual.current !== r) return; // la pantalla ya pidió otra cosa (cambió de día, etc.)
      setDatos(d);
      setError(null);
    } catch (e) {
      if (rutaActual.current !== r) return;
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar con el panel');
      // Sin esto, a alguien al que le sacan el acceso mientras tiene el panel abierto le
      // quedaban visibles los datos de la última carga buena debajo del cartel de error —
      // en una pantalla con sondeo (Bandeja, Atención, una charla), sin límite de tiempo
      // (auditoría de logica, 21/9). cliente.ts corta con una redirección en los casos
      // claros (401, o 403 de "no aprobado"); esto cubre cualquier 401/403, incluido lo
      // que la redirección no toca a propósito (un 403 de "no sos admin" en una ruta
      // puntual, que cada pantalla explica en el lugar en vez de sacar a nadie).
      if (e instanceof ErrorApi && (e.status === 401 || e.status === 403)) setDatos(null);
    } finally {
      if (rutaActual.current === r) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!ruta) return;
    setCargando(true);
    setError(null);
    recargar();
    if (!opciones.sondeoMs) return;
    const id = setInterval(recargar, opciones.sondeoMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta, opciones.sondeoMs]);

  return { datos, cargando, error, recargar };
}
