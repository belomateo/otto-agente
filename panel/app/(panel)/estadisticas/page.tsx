// Estadísticas — métricas de Lucía, atención humana, costo de API (OpenAI) y
// bitácora. Puerto de d-bitacora.html y m-bitacora.html. El costo de API por
// consulta es lo que justifica cada decisión de modelo en STACK.md.

import { KpiCard } from '@/components/ui-otto/KpiCard';
import { kpis, eventos } from '@/lib/mock-data';

export default function EstadisticasPage() {
  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 flex-col px-6 py-5.5 md:flex">
        <div className="mb-4 flex items-baseline gap-3">
          <div className="font-serif text-[22px] font-semibold">Estadísticas</div>
          <div className="text-sm text-grafito">Sábado 12 de septiembre</div>
        </div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-grafito">Lucía · hoy</div>
        <div className="mb-4.5 grid grid-cols-4 gap-3.5">
          {kpis.map((k) => (
            <KpiCard key={k.l} numero={k.num} label={k.l} sub={k.sub} />
          ))}
        </div>
        <div className="mb-4.5 grid grid-cols-2 gap-3.5">
          <div className="rounded-otto border border-borde bg-lino p-4.5">
            <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-grafito">Atención humana · hoy</div>
            <div className="mt-3 flex gap-8">
              {[
                ['2', 'derivadas'],
                ['1', 'resuelta OK'],
                ['9 min', 'primera respuesta'],
              ].map(([n, l]) => (
                <div key={l}>
                  <div className="font-serif text-[26px] font-semibold leading-none tabular-nums">{n}</div>
                  <div className="mt-1.5 text-[12.5px] text-grafito">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-otto border border-borde bg-lino p-4.5">
            <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-grafito">Costo de API · OpenAI</div>
            <div className="mt-3 flex gap-8">
              {[
                ['$4.120', 'hoy'],
                ['$179', 'por consulta'],
                ['$86.500', 'este mes'],
              ].map(([n, l]) => (
                <div key={l}>
                  <div className="font-serif text-[26px] font-semibold leading-none tabular-nums">{n}</div>
                  <div className="mt-1.5 text-[12.5px] text-grafito">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex flex-1 flex-col overflow-hidden rounded-otto border border-borde bg-lino">
            <div className="flex items-center gap-2 border-b border-borde-suave px-4 py-3">
              <span className="flex-1 font-serif text-sm font-semibold">Bitácora</span>
              {['Tipo: todos ▾', 'Fecha: hoy ▾', 'Regla ▾', 'Cliente ▾'].map((f) => (
                <span key={f} className="rounded-pill border border-borde px-3 py-1.5 text-[12.5px] font-medium text-grafito">
                  {f}
                </span>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {eventos.map((e, i) => (
                <div key={i} className="flex h-fila items-center gap-3.5 border-b border-borde-suave px-4" style={{ background: e.bg }}>
                  <span className="w-11 flex-none text-[13px] tabular-nums text-grafito">{e.h}</span>
                  <span className="w-[84px] flex-none text-xs font-semibold" style={{ color: e.tone }}>
                    {e.tipo}
                  </span>
                  <span className="w-[150px] flex-none truncate font-serif text-sm font-semibold">{e.n}</span>
                  <span className="flex-1 truncate text-[13.5px]">{e.d}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex w-[300px] flex-none flex-col gap-3.5">
            <div className="rounded-otto border border-borde bg-lino p-4.5">
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-grafito">Tester nocturno</div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-pill bg-salvia-suave text-lg text-salvia">✓</span>
                <div>
                  <div className="font-serif text-lg font-semibold text-salvia">14 guiones · 14 ok</div>
                  <div className="text-xs text-grafito">corrió hoy a las 05:00</div>
                </div>
              </div>
              <div className="mt-3 border-t border-borde-suave pt-2.5 text-[13px] leading-[1.6] text-grafito">
                Novio · Graduado · Invitado · Urgente · Corporativo · Objeciones · Reserva…
              </div>
              <a className="mt-2 inline-block cursor-pointer text-[13px] font-medium">Ver corrida completa</a>
            </div>
            <div className="rounded-otto border border-borde border-l-[3px] border-l-ladrillo bg-lino p-3.5">
              <div className="text-[13px] font-medium text-ladrillo">Última falla · 09/09</div>
              <div className="mt-1 text-[13px] leading-[1.5] text-grafito">
                Guion «graduado»: dio precio sin catálogo en el paso 3. <a className="font-medium">Ver</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-3 pt-[18px]">
          <div className="font-serif text-[22px] font-semibold">Estadísticas</div>
          <div className="mt-0.5 text-[13px] text-grafito">Sábado 12 de septiembre</div>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <div className="grid grid-cols-2 gap-2.5">
            {kpis.map((k) => (
              <KpiCard key={k.l} numero={k.num} label={k.l} sub={k.sub} />
            ))}
          </div>
          <div className="rounded-otto border border-borde bg-lino p-3.5 text-[12.5px] leading-[1.7] text-grafito">
            Atención humana: <span className="font-medium text-tinta">2 derivadas · 1 OK · 9 min</span>
            <br />
            API OpenAI: <span className="font-medium tabular-nums text-tinta">$4.120 hoy · $179/consulta</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-otto border border-borde bg-lino p-3.5">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-pill bg-salvia-suave font-semibold text-salvia">✓</span>
            <span className="font-serif text-sm font-semibold text-salvia">Tester: 14 guiones · 14 ok</span>
            <span className="ml-auto text-[11.5px] text-grafito">05:00</span>
          </div>
          <div className="overflow-hidden rounded-otto border border-borde">
            {eventos.map((e, i) => (
              <div key={i} className="border-b border-borde-suave px-3.5 py-[11px] last:border-b-0" style={{ background: e.bg }}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11.5px] font-semibold" style={{ color: e.tone }}>
                    {e.tipo}
                  </span>
                  <span className="flex-1 truncate font-serif text-[13px] font-semibold">{e.n}</span>
                  <span className="text-[11.5px] tabular-nums text-grafito">{e.h}</span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] leading-[1.45] text-grafito">{e.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
