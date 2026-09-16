'use client';

// Guardar · Deshacer · Ver versión anterior, la barra de cada fila editable de Configuración
// (DISENO.md § 8). "Hay cambios sin guardar" en Cobre, como el borde del Editor. Con datos
// reales cada fila tiene su propia versión (H1.9): esta barra se usa una vez por fila, no una
// sola vez por pantalla como en el mock. `onVerHistorial` es opcional: las filas que todavía no
// tienen id real (una que se está por crear) no tienen historial que mostrar.

export function AccionesEdicion({
  sucio,
  guardando = false,
  onGuardar,
  onDeshacer,
  onVerHistorial,
}: {
  sucio: boolean;
  guardando?: boolean;
  onGuardar: () => void;
  onDeshacer: () => void;
  onVerHistorial?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1">
      <button type="button" onClick={onGuardar} disabled={guardando} className="rounded-otto bg-cobre px-5 py-2.5 text-sm font-medium text-lino disabled:opacity-50">
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      <button
        type="button"
        onClick={onDeshacer}
        disabled={!sucio || guardando}
        className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito disabled:opacity-50"
      >
        Deshacer
      </button>
      {sucio && <span className="text-[14px] text-cobre md:text-[13px]">Hay cambios sin guardar</span>}
      {onVerHistorial && (
        <button type="button" onClick={onVerHistorial} className="ml-auto text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
          Ver versión anterior
        </button>
      )}
    </div>
  );
}

export const TARJETA = 'rounded-otto border border-borde bg-lino p-3.5 md:p-4.5';
export const ETIQUETA = 'mb-2 block text-[14px] font-medium text-grafito md:text-[13px]';
export const CAMPO = 'w-full rounded-otto border border-borde bg-lino px-3 py-2.5 text-[15px] outline-none focus:border-cobre';
