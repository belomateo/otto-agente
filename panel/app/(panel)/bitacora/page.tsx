// Bitácora › Actividad — los números del día, la línea de tiempo de eventos y
// el último tester. Puerto de d-bitacora.html y m-bitacora.html (antes
// "Estadísticas": la pestaña se llama Bitácora, decisión de Mateo, 12/9). El
// costo de API por consulta es lo que justifica cada decisión de modelo en STACK.md.

import { KpiCard } from '@/components/ui-otto/KpiCard';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { kpis, eventos } from '@/lib/mock-data';
import { pideVacio, type BusquedaPagina } from '../vacio';

const VACIO = {
  titulo: 'Todavía no pasó nada hoy',
  texto: 'Cada mensaje, turno y derivación de Lucía queda anotado acá.',
};

const FILTROS = ['Tipo: todos ▾', 'Fecha: hoy ▾', 'Regla ▾', 'Cliente ▾'];

const ROTULO = 'text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]';

export default async function ActividadPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);
  const numeros = vacia ? kpis.map((k) => ({ ...k, num: k.num.endsWith('%') ? '0%' : '0' })) : kpis;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden min-h-0 flex-1 flex-col px-6 pb-5.5 pt-4 md:flex">
        <div className={`mb-2 ${ROTULO}`}>Lucía · hoy</div>
        <div className="mb-4.5 grid grid-cols-4 gap-3.5">
          {numeros.map((k) => (
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
                <div className={ROTULO}>Atención humana · hoy</div>
                <div className="mt-3 flex gap-8">
                  {[
                    ['2', 'derivadas'],
                    ['1', 'resuelta OK'],
                    ['9 min', 'primera respuesta'],
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
                    ['$4.120', 'hoy'],
                    ['$179', 'por consulta'],
                    ['$86.500', 'este mes'],
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
                    <span key={f} className="rounded-pill border border-borde px-3 py-1.5 text-[14px] font-medium text-grafito md:text-[12.5px]">
                      {f}
                    </span>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {eventos.map((e, i) => (
                    <div key={i} className="flex h-fila items-center gap-3.5 border-b border-borde-suave px-4" style={{ background: e.bg }}>
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
                <div className="rounded-otto border border-borde bg-lino p-4.5">
                  <div className={`mb-2.5 ${ROTULO}`}>Tester nocturno</div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-pill bg-salvia-suave text-lg text-salvia">✓</span>
                    <div>
                      <div className="font-serif text-lg font-semibold text-salvia">14 guiones · 14 ok</div>
                      <div className="text-[14px] text-grafito md:text-xs">corrió hoy a las 05:00</div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-borde-suave pt-2.5 text-[14px] leading-[1.6] text-grafito md:text-[13px]">
                    Novio · Graduado · Invitado · Urgente · Corporativo · Objeciones · Reserva…
                  </div>
                  <button type="button" className="mt-2 text-[14px] font-medium md:text-[13px]">
                    Ver corrida completa
                  </button>
                </div>
                <div className="rounded-otto border border-borde border-l-[3px] border-l-ladrillo bg-lino p-3.5">
                  <div className="text-[14px] font-medium text-ladrillo md:text-[13px]">Última falla · 09/09</div>
                  <div className="mt-1 text-[14px] leading-[1.5] text-grafito md:text-[13px]">
                    Guion «graduado»: dio precio sin catálogo en el paso 3.{' '}
                    <button type="button" className="font-medium text-tinta">
                      Ver
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3 md:hidden">
        <div className="grid grid-cols-2 gap-2.5">
          {numeros.map((k) => (
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
              Atención humana: <span className="font-medium text-tinta">2 derivadas · 1 OK · 9 min</span>
              <br />
              API OpenAI: <span className="font-medium tabular-nums text-tinta">$4.120 hoy · $179/consulta</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-otto border border-borde bg-lino p-3.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-pill bg-salvia-suave font-semibold text-salvia">✓</span>
              <span className="font-serif text-sm font-semibold text-salvia">Tester: 14 guiones · 14 ok</span>
              <span className="ml-auto text-[14px] tabular-nums text-grafito">05:00</span>
            </div>
            <div className="overflow-hidden rounded-otto border border-borde">
              {eventos.map((e, i) => (
                <div key={i} className="border-b border-borde-suave px-3.5 py-[11px] last:border-b-0" style={{ background: e.bg }}>
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
