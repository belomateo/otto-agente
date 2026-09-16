'use client';

// Error al pedir datos reales de la API (panel/app/api/**). Hermano de EstadoVacio: mismo
// layout, pero en Ladrillo y con «!» en vez de la «L» de Lucía, para no confundir "todavía no
// hay nada acá" con "esto se rompió". Reintentar vuelve a pedir sin recargar la página.

export function EstadoError({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-9 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-ladrillo font-serif text-[22px] font-semibold text-lino">!</div>
      <div className="font-serif text-[17px] font-semibold">No se pudo cargar</div>
      <div className="max-w-[280px] text-sm leading-[1.55] text-grafito">{mensaje}</div>
      {onReintentar && (
        <button type="button" onClick={onReintentar} className="rounded-otto border border-cobre bg-lino px-4 py-2 text-[14px] font-medium text-cobre md:text-sm">
          Reintentar
        </button>
      )}
    </div>
  );
}
