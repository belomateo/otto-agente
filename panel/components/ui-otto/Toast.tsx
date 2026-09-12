// Toast de confirmación. Ver DISENO.md § componentes, 10.
// Todo Guardar del panel dispara uno de estos (H1.9). El de error existe para
// cuando el prompt base no pasa la validación de scripts/armar-prompt.mjs.

export function Toast({
  variante = 'ok',
  texto,
  accion,
}: {
  variante?: 'ok' | 'error';
  texto: string;
  accion: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-otto bg-tinta px-[18px] py-3 text-[13.5px] font-medium text-hueso shadow-otto-pop">
      <span className={variante === 'ok' ? 'text-[#8FBF95]' : 'text-[#E8938A]'}>
        {variante === 'ok' ? '✓' : '✗'}
      </span>
      {texto}
      <a className="ml-auto cursor-pointer text-[#E9C9A8]">{accion}</a>
    </div>
  );
}
