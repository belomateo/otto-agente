// Atención humana — Pendientes / Consultas OK. Al marcar OK pasa de pestaña;
// si el cliente vuelve a escribir, reaparece en Pendientes y en la Bandeja.
// Puerto de d-atencion.html (escritorio: lista + detalle) y m-atencion.html
// (mobile: solo tarjetas, sin detalle abierto — Fase 2 agrega el drill-in).
// El chip muestra la etiqueta del motivo (derivaciones-mock.ts), no el enum.

import { Chip } from '@/components/ui-otto/Chip';
import { BurbujaCliente, BurbujaLucia } from '@/components/ui-otto/Burbuja';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { pideVacio, type BusquedaPagina } from '../vacio';
import { coloresMotivo, DERIVACIONES, ETIQUETA_MOTIVO, type Derivacion } from './derivaciones-mock';

const VACIO = { titulo: 'Todavía no hay derivaciones', texto: 'Lucía está atendiendo sola.' };
const CONSULTAS_OK = 5;

// Texto fijo de la derivación por evento hoy o mañana: sin decirle que no (decisión #8, 14/9).
const TEXTO_EVENTO_INMINENTE =
  'Te paso con un asesor del local para que te ayude con tu evento, y vamos a hacer lo posible por encontrarte un lugar en la agenda.';

function ChipMotivo({ d, className }: { d: Derivacion; className: string }) {
  const { bg, fg } = coloresMotivo(d.motivo);
  return (
    <Chip bg={bg} fg={fg} className={className}>
      {ETIQUETA_MOTIVO[d.motivo]}
    </Chip>
  );
}

function TarjetaDerivacion({ d, abierta, compacta = false }: { d: Derivacion; abierta: boolean; compacta?: boolean }) {
  return (
    <div className="rounded-otto border bg-lino p-4 shadow-otto" style={{ borderColor: abierta ? '#A8703F' : '#E6E1D8' }}>
      <div className="flex items-baseline gap-2.5">
        <span className="flex-1 font-serif text-base font-semibold">{d.cliente}</span>
        <span className="text-[14px] text-grafito md:text-xs">{d.hace}</span>
      </div>
      <div className="my-2">
        <ChipMotivo d={d} className="px-2.5 py-[3px]" />
      </div>
      <div className={`text-[14px] leading-[1.5] text-grafito md:text-[13.5px] ${compacta ? '' : 'line-clamp-2'}`}>{d.resumen}</div>
      {compacta && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="flex-1 rounded-otto bg-cobre py-2.5 text-sm font-medium text-lino">
            Responder
          </button>
          <button type="button" className="rounded-otto border border-salvia bg-lino px-4 py-2.5 text-sm font-medium text-salvia">
            ✓ OK
          </button>
        </div>
      )}
    </div>
  );
}

export default async function AtencionPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);
  const lista = vacia ? [] : DERIVACIONES;
  const principal = lista[0];

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex w-[420px] flex-none flex-col gap-3.5 border-r border-borde p-5">
          <div>
            <h1 className="font-serif text-[22px] font-semibold">Atención humana</h1>
            <div className="mt-2.5 flex gap-0.5 border-b border-borde text-[14px] font-medium md:text-[13.5px]">
              <span className="-mb-px border-b-2 border-cobre px-3 py-2 text-cobre">
                Pendientes{' '}
                <Chip bg={lista.length ? '#A6473A' : '#EFEDE8'} fg={lista.length ? '#FFFFFF' : '#5C6068'} className="ml-0.5 px-[7px] py-px text-[14px] font-semibold md:text-[11px]">
                  {lista.length}
                </Chip>
              </span>
              <span className="px-3 py-2 text-grafito">
                Consultas OK <Chip className="ml-0.5 px-[7px] py-px text-[14px] font-semibold md:text-[11px]">{CONSULTAS_OK}</Chip>
              </span>
            </div>
          </div>
          {vacia ? (
            <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
          ) : (
            lista.map((d) => <TarjetaDerivacion key={d.cliente} d={d} abierta={d === principal} />)
          )}
        </div>
        {principal ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-borde bg-lino px-6 py-4">
              <div className="flex-1">
                <span className="font-serif text-lg font-semibold">{principal.cliente}</span>
                <ChipMotivo d={principal} className="ml-2.5 px-2.5 py-[3px]" />
              </div>
              <span className="text-[14px] text-grafito md:text-[12.5px]">{principal.hace}</span>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5">
              <div className="rounded-otto border border-borde border-l-[3px] border-l-ladrillo bg-lino px-4 py-3 text-sm leading-[1.55]">
                <span className="font-semibold text-ladrillo">Resumen de Lucía:</span> {principal.resumen}
              </div>
              <BurbujaCliente texto="necesito el traje para hoy sí o sí, me recibo a la noche" hora="09:47" />
              <BurbujaLucia
                texto={TEXTO_EVENTO_INMINENTE}
                hora="09:48"
                resumen={{ tono: 'ladrillo', texto: `Derivado: ${ETIQUETA_MOTIVO[principal.motivo].toLowerCase()}` }}
              />
              <div className="flex-1" />
              <textarea
                placeholder={`Escribile a ${principal.cliente.split(' ')[0]} — tu mensaje sale con la etiqueta «mostrador»`}
                aria-label="Respuesta del equipo"
                className="min-h-[96px] w-full resize-none rounded-otto border border-borde px-3.5 py-3 text-[14.5px] leading-[1.5] outline-none focus:border-cobre"
              />
              <div className="flex items-center justify-between">
                <button type="button" className="rounded-otto border border-salvia bg-lino px-4.5 py-2.5 text-sm font-medium text-salvia">
                  ✓ Marcar OK
                </button>
                <div className="flex gap-2.5">
                  <button type="button" className="rounded-otto border border-cobre bg-lino px-4.5 py-2.5 text-sm font-medium text-cobre">
                    Devolver a Lucía
                  </button>
                  <button type="button" className="rounded-otto bg-cobre px-5 py-2.5 text-sm font-medium text-lino">
                    Responder
                  </button>
                </div>
              </div>
              <div className="text-[14px] text-grafito md:text-xs">
                Marcar OK la pasa a «Consultas OK». Si el cliente vuelve a escribir, reaparece en Pendientes y en la Bandeja.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-hueso" />
        )}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-1 pt-[18px]">
          <div className="font-serif text-[22px] font-semibold">Atención humana</div>
          <div className="mt-2.5 flex overflow-hidden rounded-otto border border-borde text-[14px] font-medium">
            <span className="flex-1 bg-cobre py-2 text-center text-lino">Pendientes · {lista.length}</span>
            <span className="flex-1 bg-lino py-2 text-center text-grafito">Consultas OK · {CONSULTAS_OK}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {vacia ? (
            <div className="rounded-otto border border-borde bg-lino">
              <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
            </div>
          ) : (
            lista.map((d) => <TarjetaDerivacion key={d.cliente} d={d} abierta={d === principal} compacta />)
          )}
        </div>
      </div>
    </>
  );
}
