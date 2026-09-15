'use client';

// Catálogo — conectado a GET /api/catalogo (H1.8, paneles). Puerto de d-catalogo.html (grilla
// 3 columnas + panel de edición) y m-catalogo.html (grilla 2 columnas). En mobile se suma la
// lista de Accesorios, que el canvas no traía.
//
// Modelos y accesorios son solo-admin del lado del servidor (H1.9): con un usuario aprobado
// que no sea admin, el switch y Guardar van a fallar con 403; acá no se oculta nada, se deja
// que el propio error lo diga.

import { useRouter, useSearchParams } from 'next/navigation';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { useDatos } from '@/components/api/useDatos';
import type { FilaAccesorio, FilaModelo } from '@/lib/queries/catalogo';
import { EdicionModelo } from './EdicionModelo';
import { SwitchMuestra } from './SwitchMuestra';

const VACIO = { titulo: 'Todavía no hay modelos', texto: 'Lucía solo muestra lo que está cargado acá.' };
const SIN_CONECTAR = 'Todavía no conectado';

function FotoPlaceholder({ texto, chico = false }: { texto: string; chico?: boolean }) {
  return (
    <div className="flex aspect-[3/4] items-center justify-center" style={{ background: 'repeating-linear-gradient(45deg,#EFEBE3 0 12px,#F5F1EA 12px 24px)' }}>
      <span className={`max-w-[85%] rounded-[6px] border border-dashed border-[#C9C4B9] bg-lino text-center font-mono text-[#8A8578] ${chico ? 'px-[7px] py-[3px] text-[14px]' : 'px-2.5 py-1 text-[14px] md:text-[11px]'}`}>
        {chico ? texto : `foto ${texto}`}
      </span>
    </div>
  );
}

function Foto({ modelo, chico = false }: { modelo: FilaModelo; chico?: boolean }) {
  if (!modelo.foto) return <FotoPlaceholder texto={modelo.n} chico={chico} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={modelo.foto} alt={modelo.n} className="aspect-[3/4] w-full object-cover" />;
}

export default function CatalogoPage() {
  const router = useRouter();
  const idAbierto = useSearchParams().get('id');
  const { datos, cargando, error, recargar } = useDatos<{ modelos: FilaModelo[]; accesorios: FilaAccesorio[] }>('/api/catalogo');
  const modelos = datos?.modelos ?? [];
  const accesorios = datos?.accesorios ?? [];
  const modeloAbierto = modelos.find((m) => m.id === idAbierto) ?? null;

  const contenido =
    cargando && modelos.length === 0 ? (
      <Cargando />
    ) : error ? (
      <EstadoError mensaje={error} onReintentar={recargar} />
    ) : modelos.length === 0 ? (
      <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
    ) : null;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5.5">
          <div className="mb-4 flex items-center">
            <h1 className="flex-1 font-serif text-[22px] font-semibold">Catálogo</h1>
            <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto bg-cobre/50 px-4.5 py-2.5 text-sm font-medium text-lino">
              Nuevo modelo
            </button>
          </div>
          {contenido ?? (
            <div className="grid grid-cols-3 gap-4">
              {modelos.map((c) => (
                <div key={c.id} className="overflow-hidden rounded-otto border border-borde bg-lino">
                  {/* Un <button> no puede anidar el <button role="switch"> de SwitchMuestra: abrir la
                      ficha y tocar el switch son dos gestos separados, no uno adentro del otro. */}
                  <button type="button" onClick={() => router.push(`/catalogo?id=${c.id}`)} className="block w-full text-left">
                    <Foto modelo={c} />
                    <div className="px-3.5 pt-3.5">
                      <div className="font-serif text-[15.5px] font-semibold">{c.n}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {c.dots.map((d, i) => (
                          <span key={i} className="h-3 w-3 rounded-pill border border-black/10" style={{ background: d }} />
                        ))}
                        <span className="ml-1 text-[14px] text-grafito md:text-xs">Talles {c.talles || '—'}</span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center px-3.5 pb-3.5 pt-2.5">
                    <span className="flex-1 font-serif text-[15px] font-semibold tabular-nums">{c.p}</span>
                    <SwitchMuestra ruta={`/api/catalogo/modelos/${c.id}`} version={c.version} activo={c.on} nombre={c.n} onGuardado={recargar} />
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
              {accesorios.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-grafito">Todavía no hay accesorios cargados.</div>
              ) : (
                accesorios.map((a) => (
                  <div key={a.id} className="flex h-[52px] items-center gap-3 border-b border-borde-suave px-4 text-sm last:border-b-0">
                    <span className="flex-1 font-serif text-[14.5px] font-semibold">{a.n}</span>
                    <span className="w-[110px] tabular-nums">{a.alq}</span>
                    <span className="w-[150px] tabular-nums text-grafito">{a.compra}</span>
                    <span className="w-[90px]">
                      <SwitchMuestra ruta={`/api/catalogo/accesorios/${a.id}`} version={a.version} activo={a.activo} nombre={a.n} conEtiqueta={false} onGuardado={recargar} />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {!contenido && modeloAbierto && <EdicionModelo modelo={modeloAbierto} onGuardado={recargar} onCerrar={() => router.push('/catalogo')} />}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="flex items-center px-4 pb-2.5 pt-[18px]">
          <div className="flex-1 font-serif text-[22px] font-semibold">Catálogo</div>
          <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto bg-cobre/50 px-3.5 py-2 text-[14px] font-medium text-lino">
            Nuevo modelo
          </button>
        </div>
        <div className="flex-1 px-4 pb-4 pt-1.5">
          {contenido ?? (
            <div className="grid grid-cols-2 gap-3">
              {modelos.map((c) => (
                <div key={c.id} className="overflow-hidden rounded-otto border border-borde bg-lino">
                  <Foto modelo={c} chico />
                  <div className="p-2.5">
                    <div className="font-serif text-sm font-semibold leading-tight">{c.n}</div>
                    <div className="mt-1.5 flex items-center">
                      <span className="flex-1 font-serif text-sm font-semibold tabular-nums">{c.p}</span>
                      <SwitchMuestra ruta={`/api/catalogo/modelos/${c.id}`} version={c.version} activo={c.on} nombre={c.n} conEtiqueta={false} onGuardado={recargar} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-2 mt-4 font-serif text-base font-semibold">Accesorios</h2>
          <div className="overflow-hidden rounded-otto border border-borde bg-lino">
            {accesorios.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-sm text-grafito">Todavía no hay accesorios cargados.</div>
            ) : (
              accesorios.map((a) => (
                <div key={a.id} className="flex items-center gap-3 border-b border-borde-suave px-3.5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[15px] font-semibold">{a.n}</div>
                    <div className="text-[14px] tabular-nums text-grafito">
                      Alquiler {a.alq} · compra {a.compra}
                    </div>
                  </div>
                  <SwitchMuestra ruta={`/api/catalogo/accesorios/${a.id}`} version={a.version} activo={a.activo} nombre={a.n} conEtiqueta={false} onGuardado={recargar} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
