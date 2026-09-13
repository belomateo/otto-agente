// Hilo de charla de Nicolás Pereyra — el ejemplo fijo del diseño (d-bandeja /
// m-charla). Puerto directo del canvas: mismo texto, mismo orden de mensajes,
// misma bitácora. Compartido por la vista de escritorio y la de mobile. La
// bitácora del último mensaje va plegada y se abre desde la «i» (Burbuja.tsx);
// el mini resumen de la barandilla se ve al costado sin abrir nada.

import { BurbujaCliente, BurbujaLucia } from '@/components/ui-otto/Burbuja';
import { IconAudio, IconFoto } from '@/components/nav/icons';

export function ChatThread({ variante }: { variante: 'desktop' | 'mobile' }) {
  const compacto = variante === 'mobile';

  return (
    // min-w-0: sin esto el texto truncado de abajo fija el ancho mínimo del hilo y la página desborda de costado.
    <div className="flex min-w-0 flex-1 flex-col bg-hueso">
      <div className={`flex items-center gap-4 border-b border-borde bg-lino ${compacto ? 'p-3.5' : 'px-6 py-3.5'}`}>
        {compacto && <span className="text-xl text-grafito">‹</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
            <span className="font-serif text-[17px] font-semibold">Nicolás Pereyra</span>
            {!compacto && (
              <span className="text-[14px] text-grafito md:text-[13px]">
                Invitado · Casamiento 25/10 · Noche · Talle 48 · Turno sáb 10:15
              </span>
            )}
          </div>
          {compacto ? (
            <div className="truncate text-[14px] text-grafito md:text-xs">Invitado · Casamiento 25/10 · Talle 48 · sáb 10:15</div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1.5 text-[14px] text-grafito md:text-xs">
              <span className="inline-block h-[7px] w-[7px] rounded-pill bg-noche" />
              La charla la tiene Lucía
              <span className="ml-2 rounded-pill border border-borde px-2 py-0.5 text-[14px] md:text-[11px]">Casamiento</span>
              <span className="cursor-pointer rounded-pill border border-dashed border-[#C9C4B9] px-2 py-0.5 text-[14px] text-[#8A8578] md:text-[11px]">
                + Etiqueta
              </span>
            </div>
          )}
        </div>
        {!compacto ? (
          <>
            <button className="flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium md:text-[13.5px]">
              Ver ficha
            </button>
            <button className="flex-none rounded-otto bg-cobre px-4 py-2 text-[14px] font-medium text-lino md:text-[13.5px]">
              Tomar la charla
            </button>
          </>
        ) : (
          <span className="flex-none rounded-pill bg-noche-suave px-2.5 py-[3px] text-[14px] font-medium text-noche md:text-[11.5px]">
            Lucía
          </span>
        )}
      </div>

      {compacto && (
        <div className="flex gap-2 border-b border-borde bg-lino p-3.5 pt-0">
          <button className="flex-1 rounded-otto border border-borde bg-lino py-2 text-[14px] font-medium md:text-[13px]">
            Ver ficha
          </button>
          <button className="flex-1 rounded-otto bg-cobre py-2 text-[14px] font-medium text-lino md:text-[13px]">
            Tomar la charla
          </button>
        </div>
      )}

      <div className={`flex flex-1 flex-col gap-3.5 overflow-y-auto ${compacto ? 'p-4' : 'px-7 py-5.5'}`}>
        {!compacto && (
          <span className="self-center rounded-pill bg-[#EFEBE3] px-3 py-[3px] text-[14px] text-grafito md:text-xs">
            Hoy, sábado 12/9
          </span>
        )}
        <BurbujaCliente texto="hola queria saber cuanto sale alquilar un traje" hora="10:01" />
        <BurbujaLucia texto="¡Hola! Soy Lucía, asistente de Mr. Otto. Claro que sí, te ayudo. Para recomendarte la mejor opción, contame: ¿para qué evento necesitás el traje?" hora="10:01" />
        <BurbujaCliente texto="casamiento el 25 de octubre" hora="10:01" />
        <BurbujaLucia texto="¡Qué bueno! ¿Vas como invitado o sos el novio?" hora="10:02" />
        <BurbujaCliente texto="invitado" hora="10:02" />
        <BurbujaLucia
          destacada
          texto="Perfecto. Para un casamiento podemos trabajar desde un azul noche clásico hasta opciones más actuales. El alquiler a medida arranca desde $150.000 e incluye sastrería y tintorería antes y después del evento. ¿Es de día o de noche? 🤵‍♂️"
          hora="10:03"
          resumen={{ tono: 'ambar', texto: 'Rehecho: precio sin herramienta' }}
          bitacora={{
            costo: '1.840 tokens · 3,2 s',
            pasos: [
              { tipo: 'ok', texto: 'Clasificador → intención «alquiler» · urgencia baja' },
              { tipo: 'error', texto: 'Barandilla: intentó dar un precio sin consultar el catálogo → rehecho' },
              { tipo: 'ok', texto: 'consultar_catalogo(evento: casamiento)', codigo: true },
              { tipo: 'pensamiento', texto: 'Ya tengo evento y rol, falta día/noche antes de mostrar looks. Anclé el valor antes del precio.' },
            ],
          }}
        />
      </div>

      <div className={`flex items-center gap-2.5 border-t border-borde bg-lino ${compacto ? 'px-3.5 pb-[22px] pt-2.5' : 'px-6 py-3.5'}`}>
        {!compacto && (
          <>
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde opacity-45">
              <IconFoto className="text-grafito" />
            </span>
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde opacity-45">
              <IconAudio className="text-grafito" />
            </span>
          </>
        )}
        {compacto && (
          <>
            <span className="flex-none opacity-50">
              <IconFoto className="text-grafito" width={20} height={20} />
            </span>
            <span className="flex-none opacity-50">
              <IconAudio className="text-grafito" width={20} height={20} />
            </span>
          </>
        )}
        <div
          className={`min-w-0 flex-1 truncate text-[#8A8D94] ${
            compacto ? 'rounded-pill px-3.5 py-2.5 text-[14px] md:text-[13.5px]' : 'rounded-otto px-3.5 py-2.5 text-sm'
          }`}
          style={{ background: '#F3F0EA', border: '1px solid #E6E1D8' }}
        >
          Lucía está atendiendo. Tomá la charla para responder — fotos y audios se habilitan al tomarla.
        </div>
        {compacto ? (
          <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-pill bg-[#EFEBE3] text-base text-[#8A8D94]">
            ↑
          </span>
        ) : (
          <button className="flex-none rounded-otto border border-borde bg-lino px-4 py-2.5 text-[14px] font-medium text-cobre md:text-[13.5px]">
            Tomar la charla
          </button>
        )}
      </div>
    </div>
  );
}
