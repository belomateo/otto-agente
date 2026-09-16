'use client';

// Bitácora › Actividad — conectada a GET /api/bitacora?fecha=AAAA-MM-DD (H1.8, paneles). Los
// números del día, la línea de tiempo de eventos de Lucía y el costo de OpenAI. Puerto de
// d-bitacora.html y m-bitacora.html (antes "Estadísticas": la pestaña se llama Bitácora,
// decisión de Mateo, 12/9). El costo de API por consulta es lo que justifica cada decisión de
// modelo en STACK.md.
//
// «Tipo», «Regla» y «Cliente» eran filtros decorativos del mock: paneles no tiene ruta para
// filtrar por eso (solo por fecha), así que quedan deshabilitados en vez de simular un filtro
// que no filtra nada. «Tester nocturno» y «Última falla» tampoco tienen ruta: son del tester
// automático (tests/*), que no se lee desde el panel.

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KpiCard } from '@/components/ui-otto/KpiCard';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { useDatos } from '@/components/api/useDatos';
import type { Bitacora } from '@/lib/queries/bitacora';

const SIN_CONECTAR = 'Todavía no conectado';
const VACIO = {
  titulo: 'Todavía no pasó nada hoy',
  texto: 'Cada mensaje, turno y derivación de Lucía queda anotado acá.',
};

const FILTROS = ['Tipo: todos ▾', 'Regla ▾', 'Cliente ▾'];
const ROTULO = 'text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]';

/** 'AAAA-MM-DD' → el día siguiente o anterior, como fecha calendario (sin huso: se compara
 * contra lo que ya devolvió la API, no se calcula "hoy" del lado del cliente). */
function sumarDiaISO(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function Flechas({ fecha, children }: { fecha: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link href={`/bitacora?dia=${sumarDiaISO(fecha, -1)}`} aria-label="Día anterior" className="flex h-8 w-8 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[16px] leading-none text-grafito">
        ‹
      </Link>
      {children}
      <Link href={`/bitacora?dia=${sumarDiaISO(fecha, 1)}`} aria-label="Día siguiente" className="flex h-8 w-8 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[16px] leading-none text-grafito">
        ›
      </Link>
    </span>
  );
}

export default function ActividadPage() {
  const fechaPedida = useSearchParams().get('dia');
  const { datos: bitacora, cargando, error, recargar } = useDatos<Bitacora>(`/api/bitacora${fechaPedida ? `?fecha=${fechaPedida}` : ''}`);

  if (cargando && !bitacora) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!bitacora) return null;

  const vacia = bitacora.eventos.length === 0;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden min-h-0 flex-1 flex-col px-6 pb-5.5 pt-4 md:flex">
        <div className={`mb-2 flex items-center gap-3 ${ROTULO}`}>
          <Flechas fecha={bitacora.fecha}>
            <span className="normal-case tracking-normal text-tinta">{bitacora.titulo}</span>
          </Flechas>
        </div>
        <div className="mb-4.5 grid grid-cols-4 gap-3.5">
          {bitacora.kpis.map((k) => (
            <KpiCard key={k.l} numero={k.num} label={k.l} sub={k.sub} />
          ))}
        </div>

        {vacia ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
          </div>
        ) : (
          <>
            <div className="mb-4.5 grid grid-cols-2 gap-3.5">
              <div className="rounded-otto border border-borde bg-lino p-4.5">
                <div className={ROTULO}>Atención humana · {bitacora.titulo}</div>
                <div className="mt-3 flex gap-8">
                  {[
                    [String(bitacora.atencion.derivadas), 'derivadas'],
                    [String(bitacora.atencion.resueltas), 'resuelta OK'],
                    [bitacora.atencion.primera_respuesta, 'primera respuesta'],
                  ].map(([n, l]) => (
                    <div key={l}>
                      <div className="font-serif text-[26px] font-semibold leading-none tabular-nums">{n}</div>
                      <div className="mt-1.5 text-[14px] text-grafito md:text-[12.5px]">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-otto border border-borde bg-lino p-4.5">
                <div className={ROTULO}>Costo de API · OpenAI</div>
                <div className="mt-3 flex gap-8">
                  {[
                    [bitacora.costo.hoy, 'hoy'],
                    [bitacora.costo.por_consulta, 'por consulta'],
                    [bitacora.costo.mes, 'este mes'],
                  ].map(([n, l]) => (
                    <div key={l}>
                      <div className="font-serif text-[26px] font-semibold leading-none tabular-nums">{n}</div>
                      <div className="mt-1.5 text-[14px] text-grafito md:text-[12.5px]">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-h-[280px] flex-1 gap-4">
              <div className="flex flex-1 flex-col overflow-hidden rounded-otto border border-borde bg-lino">
                <div className="flex items-center gap-2 border-b border-borde-suave px-4 py-3">
                  <span className="flex-1 font-serif text-sm font-semibold">Línea de tiempo</span>
                  {FILTROS.map((f) => (
                    <span key={f} title={SIN_CONECTAR} className="cursor-not-allowed rounded-pill border border-dashed border-[#C9C4B9] px-3 py-1.5 text-[14px] font-medium text-[#8A8578] md:text-[12.5px]">
                      {f}
                    </span>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {bitacora.eventos.map((e) => (
                    <div key={e.id} className="flex h-fila items-center gap-3.5 border-b border-borde-suave px-4" style={{ background: e.bg }}>
                      <span className="w-11 flex-none text-[14px] tabular-nums text-grafito md:text-[13px]">{e.h}</span>
                      <span className="w-[84px] flex-none text-[14px] font-semibold md:text-xs" style={{ color: e.tone }}>
                        {e.tipo}
                      </span>
                      <span className="w-[150px] flex-none truncate font-serif text-sm font-semibold">{e.n}</span>
                      <span className="flex-1 truncate text-[14px] md:text-[13.5px]">{e.d}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex w-[300px] flex-none flex-col gap-3.5">
                <div className="rounded-otto border border-borde bg-lino p-4.5 text-[14px] text-[#8A8578] md:text-[13px]">
                  {SIN_CONECTAR}: el resultado del tester nocturno no tiene ruta en paneles todavía.
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3 md:hidden">
        <Flechas fecha={bitacora.fecha}>
          <div className="min-w-0 flex-1 truncate text-center text-[15px] font-medium">{bitacora.titulo}</div>
        </Flechas>
        <div className="grid grid-cols-2 gap-2.5">
          {bitacora.kpis.map((k) => (
            <KpiCard key={k.l} numero={k.num} label={k.l} sub={k.sub} />
          ))}
        </div>
        {vacia ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
          </div>
        ) : (
          <>
            <div className="rounded-otto border border-borde bg-lino p-3.5 text-[14px] leading-[1.7] text-grafito">
              Atención humana: <span className="font-medium text-tinta">{bitacora.atencion.derivadas} derivadas · {bitacora.atencion.resueltas} OK · {bitacora.atencion.primera_respuesta}</span>
              <br />
              API OpenAI: <span className="font-medium tabular-nums text-tinta">{bitacora.costo.hoy} hoy · {bitacora.costo.por_consulta}/consulta</span>
            </div>
            <div className="overflow-hidden rounded-otto border border-borde">
              {bitacora.eventos.map((e) => (
                <div key={e.id} className="border-b border-borde-suave px-3.5 py-[11px] last:border-b-0" style={{ background: e.bg }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold" style={{ color: e.tone }}>
                      {e.tipo}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold">{e.n}</span>
                    <span className="text-[14px] tabular-nums text-grafito">{e.h}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[14px] leading-[1.45] text-grafito">{e.d}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
