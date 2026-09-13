'use client';

// Toast de confirmación. Ver DISENO.md § componentes, 10.
// Todo Guardar del panel dispara uno de estos (H1.9). El de error existe para
// cuando el prompt base no pasa la validación de scripts/armar-prompt.mjs.
// La acción (casi siempre "Deshacer") es un botón de verdad: en Fase 2 revierte
// la edición recién guardada.

export function Toast({
  variante = 'ok',
  texto,
  accion,
  onAccion,
}: {
  variante?: 'ok' | 'error';
  texto: string;
  accion: string;
  onAccion?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-otto bg-tinta px-[18px] py-3 text-[14px] font-medium text-hueso shadow-otto-pop md:text-[13.5px]"
    >
      <span className={variante === 'ok' ? 'text-[#8FBF95]' : 'text-[#E8938A]'} aria-hidden>
        {variante === 'ok' ? '✓' : '✗'}
      </span>
      <span className="min-w-0 flex-1">{texto}</span>
      <button type="button" onClick={onAccion} className="ml-auto flex-none text-[#E9C9A8] underline-offset-2 hover:underline">
        {accion}
      </button>
    </div>
  );
}
