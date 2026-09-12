// Catálogo — grilla, accesorios y edición abierta. Puerto de d-catalogo.html
// (grilla 3 columnas + panel de edición) y m-catalogo.html (grilla 2 columnas).

import { Switch } from '@/components/ui-otto/Switch';
import { catalogo, accesorios } from '@/lib/mock-data';

function FotoPlaceholder({ texto, chico = false }: { texto: string; chico?: boolean }) {
  return (
    <div
      className="flex aspect-[3/4] items-center justify-center"
      style={{ background: 'repeating-linear-gradient(45deg,#EFEBE3 0 12px,#F5F1EA 12px 24px)' }}
    >
      <span
        className={`rounded-[6px] border border-dashed border-[#C9C4B9] bg-lino text-center font-mono text-[#8A8578] ${
          chico ? 'px-[7px] py-[3px] text-[10px]' : 'px-2.5 py-1 text-[11px]'
        }`}
      >
        {chico ? texto : `foto ${texto}`}
      </span>
    </div>
  );
}

export default function CatalogoPage() {
  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex-1 overflow-y-auto px-6 py-5.5">
          <div className="mb-4 flex items-center">
            <div className="flex-1 font-serif text-[22px] font-semibold">Catálogo</div>
            <button className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">Nuevo modelo</button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {catalogo.map((c) => (
              <div key={c.n} className="overflow-hidden rounded-otto border border-borde">
                <FotoPlaceholder texto={c.foto} />
                <div className="p-3.5">
                  <div className="font-serif text-[15.5px] font-semibold">{c.n}</div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {c.dots.map((d) => (
                      <span key={d} className="h-3 w-3 rounded-pill border border-black/10" style={{ background: d }} />
                    ))}
                    <span className="ml-1 text-xs text-grafito">Talles {c.talles}</span>
                  </div>
                  <div className="mt-2.5 flex items-center">
                    <span className="flex-1 font-serif text-[15px] font-semibold tabular-nums">{c.p}</span>
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-grafito">
                      {c.on ? 'Lucía lo muestra' : 'No lo muestra'}
                      <Switch defaultChecked={c.on} size="sm" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4.5 max-w-[720px]">
            <div className="mb-2 font-serif text-base font-semibold">Accesorios</div>
            <div className="overflow-hidden rounded-otto border border-borde">
              <div className="flex h-9 items-center gap-3 border-b border-borde bg-[#FBFAF7] px-4 text-[11px] font-semibold uppercase tracking-[.05em] text-grafito">
                <span className="flex-1">Accesorio</span>
                <span className="w-[110px]">Alquiler</span>
                <span className="w-[150px]">Compra c/ descuento</span>
                <span className="w-[90px]">Lucía</span>
              </div>
              {accesorios.map((a) => (
                <div key={a.n} className="flex h-[52px] items-center gap-3 border-b border-borde-suave px-4 text-sm last:border-b-0">
                  <span className="flex-1 font-serif text-[14.5px] font-semibold">{a.n}</span>
                  <span className="w-[110px] tabular-nums">{a.alq}</span>
                  <span className="w-[150px] tabular-nums text-grafito">{a.compra}</span>
                  <span className="w-[90px]">
                    <Switch defaultChecked size="sm" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex w-[380px] flex-none flex-col border-l border-borde bg-lino">
          <div className="flex items-baseline gap-2.5 border-b border-borde-suave px-5.5 pb-3.5 pt-5">
            <span className="flex-1 font-serif text-[19px] font-semibold">Ambo azul noche corte italiano</span>
            <span className="cursor-pointer text-xs text-grafito">✕</span>
          </div>
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5.5 py-4.5">
            <div className="rounded-otto border-[1.5px] border-dashed border-[#C9C4B9] bg-[#FBFAF7] p-4.5 text-center text-[13px] leading-[1.5] text-grafito">
              Arrastrá fotos acá
              <br />
              <span className="text-xs text-[#8A8578]">o pegá un link de imagen</span>
            </div>
            <div className="flex gap-2">
              <div className="h-[74px] w-14 rounded-[6px] border border-borde" style={{ background: 'repeating-linear-gradient(45deg,#EFEBE3 0 8px,#F5F1EA 8px 16px)' }} />
              <div className="h-[74px] w-14 rounded-[6px] border border-borde" style={{ background: 'repeating-linear-gradient(45deg,#EFEBE3 0 8px,#F5F1EA 8px 16px)' }} />
              <div className="flex h-[74px] w-14 items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-[#C9C4B9] text-base text-[#8A8578]">
                +
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <label className="flex flex-col gap-1 text-[11.5px] font-medium text-grafito">
                Precio base
                <input defaultValue="$150.000" className="w-full rounded-otto border border-borde px-2.5 py-2 text-sm tabular-nums outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-medium text-grafito">
                Talles
                <input defaultValue="44 a 60" className="w-full rounded-otto border border-borde px-2.5 py-2 text-sm outline-none" />
              </label>
            </div>
            <div>
              <div className="mb-1.5 text-[11.5px] font-medium text-grafito">Colores</div>
              <div className="flex items-center gap-2">
                <span className="h-[22px] w-[22px] rounded-pill border-2 border-cobre" style={{ background: '#1F2A3C' }} />
                <span className="h-[22px] w-[22px] rounded-pill border border-borde" style={{ background: '#2E3D55' }} />
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-pill border-[1.5px] border-dashed border-[#C9C4B9] text-[13px] text-[#8A8578]">+</span>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-[11.5px] font-medium text-grafito">
              Descripción corta (la lee Lucía)
              <textarea
                defaultValue="Corte italiano entallado, solapa en punta. El clásico para casamientos de noche."
                className="min-h-16 w-full resize-none rounded-otto border border-borde px-2.5 py-2 text-sm leading-[1.5] outline-none"
              />
            </label>
            <Switch label="Lucía lo puede mostrar" defaultChecked />
          </div>
          <div className="flex items-center gap-2.5 border-t border-borde-suave px-5.5 py-3.5">
            <button className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">Guardar</button>
            <button className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">Deshacer</button>
            <a className="ml-auto cursor-pointer text-[13px]">Ver versión anterior</a>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="flex items-center px-4 pb-2.5 pt-[18px]">
          <div className="flex-1 font-serif text-[22px] font-semibold">Catálogo</div>
          <button className="rounded-otto bg-cobre px-3.5 py-2 text-[13px] font-medium text-lino">Nuevo</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-1.5">
          <div className="grid grid-cols-2 gap-3">
            {catalogo.map((c) => (
              <div key={c.n} className="overflow-hidden rounded-otto border border-borde">
                <FotoPlaceholder texto={c.foto} chico />
                <div className="p-2.5">
                  <div className="font-serif text-sm font-semibold leading-tight">{c.n}</div>
                  <div className="mt-1.5 flex items-center">
                    <span className="flex-1 font-serif text-sm font-semibold tabular-nums">{c.p}</span>
                    <Switch defaultChecked={c.on} size="sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
