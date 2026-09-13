'use client';

// Guardar · Deshacer · Ver versión anterior, la barra de cada subpestaña de
// Configuración (DISENO.md § 8). "Hay cambios sin guardar" en Cobre, como el
// borde del Editor. La versión anterior se conecta con el historial en Fase 2.

export function AccionesEdicion({
  sucio,
  onGuardar,
  onDeshacer,
}: {
  sucio: boolean;
  onGuardar: () => void;
  onDeshacer: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1">
      <button type="button" onClick={onGuardar} className="rounded-otto bg-cobre px-5 py-2.5 text-sm font-medium text-lino">
        Guardar
      </button>
      <button
        type="button"
        onClick={onDeshacer}
        disabled={!sucio}
        className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito disabled:opacity-50"
      >
        Deshacer
      </button>
      {sucio && <span className="text-[14px] text-cobre md:text-[13px]">Hay cambios sin guardar</span>}
      <button type="button" className="ml-auto text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
        Ver versión anterior
      </button>
    </div>
  );
}

export const TARJETA = 'rounded-otto border border-borde bg-lino p-3.5 md:p-4.5';
export const ETIQUETA = 'mb-2 block text-[14px] font-medium text-grafito md:text-[13px]';
export const CAMPO = 'w-full rounded-otto border border-borde bg-lino px-3 py-2.5 text-[15px] outline-none focus:border-cobre';
