'use client';

// «Ver versión anterior» (H1.9, paneles): GET /api/historial?tabla=&id= y POST
// /api/historial/<id>/restaurar. Genérico para cualquier entidad editable (Clientes,
// Catálogo, Configuración…), así no se repite en cada pantalla que edita algo.

import { useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { enviar, ErrorApi } from './cliente';
import { useDatos } from './useDatos';

type VersionHistorial = { id: string; version: number; editado_por: string | null; editado_at: string };

export function PanelHistorial({
  tabla,
  id,
  versionActual,
  onCerrar,
  onRestaurado,
}: {
  tabla: string;
  id: string;
  versionActual: number;
  onCerrar: () => void;
  /** Se llama después de restaurar con éxito: quien lo usa vuelve a pedir los datos frescos. */
  onRestaurado: () => void;
}) {
  const { datos, cargando, error } = useDatos<{ versiones: VersionHistorial[] }>(`/api/historial?tabla=${tabla}&id=${id}`);
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function restaurar(historialId: string) {
    setRestaurandoId(historialId);
    setMensaje(null);
    try {
      await enviar(`/api/historial/${historialId}/restaurar`, 'POST', { version: versionActual });
      onRestaurado();
      onCerrar();
    } catch (e) {
      setMensaje(e instanceof ErrorApi ? e.message : 'No se pudo restaurar');
    } finally {
      setRestaurandoId(null);
    }
  }

  return (
    <div role="dialog" aria-label="Versiones anteriores" className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/[.32] p-4" onClick={onCerrar}>
      <div className="max-h-[70vh] w-full max-w-[420px] overflow-y-auto rounded-otto bg-lino p-4 shadow-otto-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-serif text-lg font-semibold">Versiones anteriores</span>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-lg leading-none text-grafito">
            ×
          </button>
        </div>
        {cargando ? (
          <Cargando />
        ) : error ? (
          <EstadoError mensaje={error} />
        ) : !datos || datos.versiones.length === 0 ? (
          <div className="text-[14px] text-grafito">Todavía no se editó esto.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {datos.versiones.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-otto border border-borde px-3 py-2.5">
                <div className="text-[14px]">
                  <div className="font-medium">Versión {v.version}</div>
                  <div className="text-grafito">
                    {v.editado_por ?? '—'} · {new Date(v.editado_at).toLocaleString('es-AR')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restaurar(v.id)}
                  disabled={restaurandoId !== null}
                  className="flex-none rounded-otto border border-cobre bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre disabled:opacity-50"
                >
                  {restaurandoId === v.id ? 'Restaurando…' : 'Restaurar'}
                </button>
              </div>
            ))}
          </div>
        )}
        {mensaje && <div className="mt-2 text-[14px] text-ladrillo">{mensaje}</div>}
      </div>
    </div>
  );
}
