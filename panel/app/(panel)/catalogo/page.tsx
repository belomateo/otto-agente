'use client';

// Catálogo — conectado a GET /api/catalogo (H1.8, paneles). Puerto de d-catalogo.html (grilla
// 3 columnas + panel de edición) y m-catalogo.html (grilla 2 columnas). En mobile se suma la
// lista de Accesorios, que el canvas no traía.
//
// Modelos y accesorios son solo-admin del lado del servidor (H1.9): con un usuario aprobado
// que no sea admin, el switch y Guardar van a fallar con 403; acá no se oculta nada, se deja
// que el propio error lo diga.
//
// «Nuevo modelo» es real (POST /api/catalogo/modelos, pedido de Mateo 16/9: el catálogo
// arranca vacío, lo carga la dueña): nombre, precio y talles nada más — fotos y colores se
// suman después abriendo el modelo recién creado. El orden por prioridad que también pidió
// (el 1 pesa más que el 10 para lo que recomienda Lucía) queda pendiente: no hay columna
// todavía en catalogo_alquiler, se lo pedimos a paneles.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useDatos } from '@/components/api/useDatos';
import type { FilaAccesorio, FilaModelo } from '@/lib/queries/catalogo';
import { EdicionModelo } from './EdicionModelo';
import { SwitchMuestra } from './SwitchMuestra';

const VACIO = { titulo: 'Todavía no hay modelos', texto: 'Lucía solo muestra lo que está cargado acá.' };
const ETIQUETA = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';

export function FotoPlaceholder({ texto, chico = false }: { texto: string; chico?: boolean }) {
  return (
    <div className="flex aspect-[3/4] items-center justify-center" style={{ background: 'repeating-linear-gradient(45deg,#EFEBE3 0 12px,#F5F1EA 12px 24px)' }}>
      <span className={`max-w-[85%] rounded-[6px] border border-dashed border-[#C9C4B9] bg-lino text-center font-mono text-[#8A8578] ${chico ? 'px-[7px] py-[3px] text-[14px]' : 'px-2.5 py-1 text-[14px] md:text-[11px]'}`}>
        {chico ? texto : `foto ${texto}`}
      </span>
    </div>
  );
}

// Un link roto (foto borrada del storage, URL vieja) muestra el ícono roto del navegador si no
// se hace nada: onError pasa al mismo placeholder que ya cubre "sin foto todavía". Se resetea
// si la URL cambia (se subió una nueva) para no quedar pegado a un error de la anterior.
function Foto({ modelo, chico = false }: { modelo: FilaModelo; chico?: boolean }) {
  const [rota, setRota] = useState(false);
  useEffect(() => setRota(false), [modelo.foto]);
  if (!modelo.foto || rota) return <FotoPlaceholder texto={modelo.n} chico={chico} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={modelo.foto} alt={modelo.n} className="aspect-[3/4] w-full object-cover" onError={() => setRota(true)} />;
}

// Alta real (POST /api/catalogo/modelos, H1.9): nombre y precio nada más — fotos y colores se
// suman después, abriendo el modelo recién creado (misma pantalla que ya los edita).
function NuevoModelo({ onCreado }: { onCreado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [modelo, setModelo] = useState('');
  const [precio, setPrecio] = useState(0);
  const [talles, setTalles] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const { fila } = await enviar<{ fila: { id: string } }>('/api/catalogo/modelos', 'POST', {
        modelo,
        precio_base: precio,
        talles: talles
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        activo: true,
      });
      setAbierto(false);
      setModelo('');
      setPrecio(0);
      setTalles('');
      onCreado(fila.id);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino md:px-3.5 md:py-2 md:text-[14px]">
        Nuevo modelo
      </button>
      {abierto && (
        <div role="dialog" aria-label="Nuevo modelo" className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/[.32] p-4" onClick={() => !enviando && setAbierto(false)}>
          <div className="w-full max-w-[380px] rounded-otto bg-lino p-4.5 shadow-otto-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-serif text-lg font-semibold">Nuevo modelo</span>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-lg leading-none text-grafito">
                ×
              </button>
            </div>
            <label className={ETIQUETA}>
              Nombre
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} className={CAMPO} autoFocus />
            </label>
            <label className={`${ETIQUETA} mt-2.5`}>
              Precio base
              <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(Number(e.target.value.replace(/\D/g, '')) || 0)} className={`${CAMPO} tabular-nums`} />
            </label>
            <label className={`${ETIQUETA} mt-2.5`}>
              Talles (separados por coma)
              <input value={talles} onChange={(e) => setTalles(e.target.value)} placeholder="44, 46, 48…" className={CAMPO} />
            </label>
            <div className="mt-3 flex items-center gap-2.5">
              <button type="button" onClick={crear} disabled={enviando || !modelo.trim() || precio <= 0} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50">
                {enviando ? 'Creando…' : 'Crear'}
              </button>
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">
                Cancelar
              </button>
            </div>
            {error && <div className="mt-2 text-[13px] text-ladrillo">{error}</div>}
          </div>
        </div>
      )}
    </>
  );
}

export default function CatalogoPage() {
  const router = useRouter();
  const idAbierto = useSearchParams().get('id');
  const { datos, cargando, error, recargar } = useDatos<{ modelos: FilaModelo[]; accesorios: FilaAccesorio[] }>('/api/catalogo');
  const modelos = datos?.modelos ?? [];
  const accesorios = datos?.accesorios ?? [];
  const modeloAbierto = modelos.find((m) => m.id === idAbierto) ?? null;

  function onModeloCreado(id: string) {
    recargar();
    router.push(`/catalogo?id=${id}`);
  }

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
            <NuevoModelo onCreado={onModeloCreado} />
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
          <NuevoModelo onCreado={onModeloCreado} />
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
