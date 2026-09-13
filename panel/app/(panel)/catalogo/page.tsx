// Catálogo — grilla, accesorios y edición abierta. Puerto de d-catalogo.html
// (grilla 3 columnas + panel de edición) y m-catalogo.html (grilla 2 columnas).
// En mobile se suma la lista de Accesorios, que el canvas no traía.

import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { Switch } from '@/components/ui-otto/Switch';
import { catalogo, accesorios } from '@/lib/mock-data';
import { pideVacio, type BusquedaPagina } from '../vacio';
import { EdicionModelo } from './EdicionModelo';
import { SwitchMuestra } from './SwitchMuestra';

const VACIO = { titulo: 'Todavía no hay modelos', texto: 'Lucía solo muestra lo que está cargado acá.' };

function FotoPlaceholder({ texto, chico = false }: { texto: string; chico?: boolean }) {
  return (
    <div
      className="flex aspect-[3/4] items-center justify-center"
      style={{ background: 'repeating-linear-gradient(45deg,#EFEBE3 0 12px,#F5F1EA 12px 24px)' }}
    >
      <span
        className={`max-w-[85%] rounded-[6px] border border-dashed border-[#C9C4B9] bg-lino text-center font-mono text-[#8A8578] ${
          chico ? 'px-[7px] py-[3px] text-[14px]' : 'px-2.5 py-1 text-[14px] md:text-[11px]'
        }`}
      >
        {chico ? texto : `foto ${texto}`}
      </span>
    </div>
  );
}

export default async function CatalogoPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);
  const modelos = vacia ? [] : catalogo;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5.5">
          <div className="mb-4 flex items-center">
            <h1 className="flex-1 font-serif text-[22px] font-semibold">Catálogo</h1>
            <button type="button" className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">
              Nuevo modelo
            </button>
          </div>
          {vacia ? (
            <div className="rounded-otto border border-borde bg-lino">
              <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {modelos.map((c) => (
                <div key={c.n} className="overflow-hidden rounded-otto border border-borde bg-lino">
                  <FotoPlaceholder texto={c.foto} />
                  <div className="p-3.5">
                    <div className="font-serif text-[15.5px] font-semibold">{c.n}</div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {c.dots.map((d) => (
                        <span key={d} className="h-3 w-3 rounded-pill border border-black/10" style={{ background: d }} />
                      ))}
                      <span className="ml-1 text-[14px] text-grafito md:text-xs">Talles {c.talles}</span>
                    </div>
                    <div className="mt-2.5 flex items-center">
                      <span className="flex-1 font-serif text-[15px] font-semibold tabular-nums">{c.p}</span>
                      <SwitchMuestra inicial={c.on} nombre={c.n} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4.5 max-w-[720px]">
            <h2 className="mb-2 font-serif text-base font-semibold">Accesorios</h2>
            <div className="overflow-hidden rounded-otto border border-borde bg-lino">
              <div className="flex h-9 items-center gap-3 border-b border-borde bg-[#FBFAF7] px-4 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">
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
                    <Switch defaultChecked size="sm" ariaLabel={`Lucía ofrece ${a.n}`} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!vacia && <EdicionModelo />}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="flex items-center px-4 pb-2.5 pt-[18px]">
          <div className="flex-1 font-serif text-[22px] font-semibold">Catálogo</div>
          <button type="button" className="rounded-otto bg-cobre px-3.5 py-2 text-[14px] font-medium text-lino">
            Nuevo modelo
          </button>
        </div>
        <div className="flex-1 px-4 pb-4 pt-1.5">
          {vacia ? (
            <div className="rounded-otto border border-borde bg-lino">
              <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {modelos.map((c) => (
                <div key={c.n} className="overflow-hidden rounded-otto border border-borde bg-lino">
                  <FotoPlaceholder texto={c.foto} chico />
                  <div className="p-2.5">
                    <div className="font-serif text-sm font-semibold leading-tight">{c.n}</div>
                    <div className="mt-1.5 flex items-center">
                      <span className="flex-1 font-serif text-sm font-semibold tabular-nums">{c.p}</span>
                      <SwitchMuestra inicial={c.on} nombre={c.n} conEtiqueta={false} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-2 mt-4 font-serif text-base font-semibold">Accesorios</h2>
          <div className="overflow-hidden rounded-otto border border-borde bg-lino">
            {accesorios.map((a) => (
              <div key={a.n} className="flex items-center gap-3 border-b border-borde-suave px-3.5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-[15px] font-semibold">{a.n}</div>
                  <div className="text-[14px] tabular-nums text-grafito">
                    Alquiler {a.alq} · compra {a.compra}
                  </div>
                </div>
                <Switch defaultChecked size="sm" ariaLabel={`Lucía ofrece ${a.n}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
