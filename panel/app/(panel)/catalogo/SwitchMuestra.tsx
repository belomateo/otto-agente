'use client';

// Switch «Lucía lo muestra» de un modelo o un accesorio — PATCH real (H1.9, paneles): solo
// `activo` cambia, así que no hace falta el panel de edición para esto. Si falla (por ejemplo,
// 403 porque quien mira esto no es admin: modelos y accesorios son solo-admin), el switch
// vuelve a como estaba y lo dice, siempre visible (no solo al pasar el mouse): tocarlo y que
// no pase nada, sin avisar por qué, es peor que la etiqueta de más.

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui-otto/Switch';
import { enviar, ErrorApi } from '@/components/api/cliente';

export function SwitchMuestra({
  ruta,
  version,
  activo,
  nombre,
  conEtiqueta = true,
  onGuardado,
}: {
  ruta: string;
  version: number;
  activo: boolean;
  nombre: string;
  conEtiqueta?: boolean;
  onGuardado: () => void;
}) {
  // activoLocal/versionLocal: optimista y autosuficiente. No esperan a que el padre recargue
  // la lista para saber la versión con la que seguir guardando — si se toca el switch dos
  // veces seguidas, la segunda ya tiene que usar la versión que dejó la primera, aunque el
  // padre todavía no haya vuelto a pedir /api/catalogo (si esperara eso, la segunda chocaría
  // con un 409 de versión vieja). Cuando el padre sí trae datos frescos, se sigue a esos.
  const [activoLocal, setActivoLocal] = useState(activo);
  const [versionLocal, setVersionLocal] = useState(version);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setActivoLocal(activo);
    setVersionLocal(version);
  }, [activo, version]);

  async function cambiar(nuevo: boolean) {
    const anterior = activoLocal;
    setActivoLocal(nuevo);
    setGuardando(true);
    setError(null);
    try {
      const { fila } = await enviar<{ fila: { version: number; activo: boolean } }>(ruta, 'PATCH', { version: versionLocal, activo: nuevo });
      setVersionLocal(fila.version);
      setActivoLocal(fila.activo);
      onGuardado();
    } catch (e) {
      setActivoLocal(anterior);
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  const texto = error ? 'No se pudo guardar' : guardando ? 'Guardando…' : activoLocal ? 'Lucía lo muestra' : 'No lo muestra';
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-grafito md:text-[11.5px]">
      {(conEtiqueta || error) && <span className={error ? 'text-ladrillo' : undefined}>{texto}</span>}
      <Switch size="sm" checked={activoLocal} onChange={cambiar} ariaLabel={`Lucía muestra ${nombre}`} />
    </span>
  );
}
