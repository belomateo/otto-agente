'use client';

// Hook de lectura para las pestañas conectadas a panel/app/api/**: pide, guarda estado de
// carga/error, y permite recargar (después de una acción, o por sondeo). `ruta` en null
// pausa el pedido (por ejemplo, mientras todavía no se sabe qué día mostrar).

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi, obtener } from './cliente';

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
