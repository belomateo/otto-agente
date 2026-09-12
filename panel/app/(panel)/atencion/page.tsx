// Atención humana — Pendientes / Consultas OK. Al marcar OK pasa de pestaña;
// si el cliente vuelve a escribir, reaparece en Pendientes y en la Bandeja.
// Puerto de d-atencion.html (escritorio: lista + detalle) y m-atencion.html
// (mobile: solo tarjetas, sin detalle abierto — Fase 2 agrega el drill-in).

import { Chip } from '@/components/ui-otto/Chip';
import { BurbujaCliente, BurbujaLucia } from '@/components/ui-otto/Burbuja';
import { derivas } from '@/lib/mock-data';

function TarjetaDerivacion({ d, compacta = false }: { d: (typeof derivas)[number]; compacta?: boolean }) {
  return (
    <div
      className="rounded-otto border bg-lino p-4 shadow-otto"
      style={{ borderColor: d.borde }}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="flex-1 font-serif text-base font-semibold">{d.n}</span>
        <span className="text-xs text-grafito">{d.hace}</span>
      </div>
      <div className="my-2">
        <Chip bg={d.cb} fg={d.cf} className="px-2.5 py-[3px]">
          {d.motivo}
        </Chip>
      </div>
      <div className={`text-[13.5px] leading-[1.5] text-grafito ${compacta ? '' : 'line-clamp-2'}`}>{d.resumen}</div>
      {compacta && (
        <div className="mt-3 flex gap-2">
          <button className="flex-1 rounded-otto bg-cobre py-2.5 text-sm font-medium text-lino">Responder</button>
          <button className="rounded-otto border border-salvia bg-lino px-4 py-2.5 text-sm font-medium text-salvia">
            ✓ OK
          </button>
        </div>
      )}
    </div>
  );
}

export default function AtencionPage() {
  const principal = derivas[0];

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex w-[420px] flex-none flex-col gap-3.5 border-r border-borde p-5">
          <div>
            <div className="font-serif text-[22px] font-semibold">Atención humana</div>
            <div className="mt-2.5 flex gap-0.5 border-b border-borde text-[13.5px] font-medium">
              <span className="-mb-px border-b-2 border-cobre px-3 py-2 text-cobre">
                Pendientes <Chip bg="#A6473A" fg="#FFFFFF" className="ml-0.5 px-[7px] py-px text-[11px] font-semibold">2</Chip>
              </span>
              <span className="px-3 py-2 text-grafito">
                Consultas OK <Chip className="ml-0.5 px-[7px] py-px text-[11px] font-semibold">5</Chip>
              </span>
            </div>
          </div>
          {derivas.map((d) => (
            <TarjetaDerivacion key={d.n} d={d} />
          ))}
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-borde bg-lino px-6 py-4">
            <div className="flex-1">
              <span className="font-serif text-lg font-semibold">Agustín Ferreyra</span>
              <Chip bg="#F6E3DF" fg="#A6473A" className="ml-2.5 px-2.5 py-[3px]">
                Turno urgente
              </Chip>
            </div>
            <span className="text-[12.5px] text-grafito">hace 12 min</span>
          </div>
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5">
            <div className="rounded-otto border border-borde border-l-[3px] border-l-ladrillo bg-lino px-4 py-3 text-sm leading-[1.55]">
              <span className="font-semibold text-ladrillo">Resumen de Lucía:</span> {principal.resumen}
            </div>
            <BurbujaCliente texto="necesito el traje para hoy sí o sí, me recibo a la noche" hora="09:47" />
            <BurbujaLucia
              texto="Entiendo la urgencia, Agustín. Hoy no me quedan turnos libres, pero le paso tu caso a un asesor del local para que te llame ahora y lo resolvemos."
              hora="09:48"
            />
            <div className="flex-1" />
            <textarea
              placeholder="Escribile a Agustín — tu mensaje sale con la etiqueta «mostrador»"
              className="min-h-[96px] w-full resize-none rounded-otto border border-borde px-3.5 py-3 text-[14.5px] leading-[1.5] outline-none"
            />
            <div className="flex items-center justify-between">
              <button className="rounded-otto border border-salvia bg-lino px-4.5 py-2.5 text-sm font-medium text-salvia">
                ✓ Marcar OK
              </button>
              <div className="flex gap-2.5">
                <button className="rounded-otto border border-cobre bg-lino px-4.5 py-2.5 text-sm font-medium text-cobre">
                  Devolver a Lucía
                </button>
                <button className="rounded-otto bg-cobre px-5 py-2.5 text-sm font-medium text-lino">Responder</button>
              </div>
            </div>
            <div className="text-xs text-grafito">
              Marcar OK la pasa a «Consultas OK». Si el cliente vuelve a escribir, reaparece en Pendientes y en la
              Bandeja.
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-1 pt-[18px]">
          <div className="font-serif text-[22px] font-semibold">Atención humana</div>
          <div className="mt-2.5 flex overflow-hidden rounded-otto border border-borde text-[13px] font-medium">
            <span className="flex-1 bg-cobre py-2 text-center text-lino">Pendientes · 2</span>
            <span className="flex-1 bg-lino py-2 text-center text-grafito">Consultas OK · 5</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {derivas.map((d) => (
            <TarjetaDerivacion key={d.n} d={d} compacta />
          ))}
        </div>
      </div>
    </>
  );
}
