// Conocimiento — buscador de prueba, propuestas de Lucía, secciones plegables.
// Puerto de d-conocimiento.html y m-conocimiento.html. "Propuestas de Lucía"
// es AGENTE.md § el análisis nocturno: preguntas que no tienen fragmento
// todavía, con el fragmento ya redactado listo para aplicar o editar.

import { Switch } from '@/components/ui-otto/Switch';

const SECCIONES = [
  { titulo: 'Qué incluye el alquiler', n: 3 },
  { titulo: 'Cómo funciona: retiro y devolución', n: 2 },
  { titulo: 'Reserva y garantía', n: 1, abierta: true },
  { titulo: 'Ubicación y horarios', n: 1 },
  { titulo: 'Talles: del XS al 68', n: 1 },
  { titulo: 'Objeciones', n: 2, abierta: true },
  { titulo: 'A medida · Anticipación · Accesorios', n: 5 },
  { titulo: 'Qué no hacemos · Descuentos', n: 5 },
  { titulo: 'Guiones: novio · graduado · invitado', n: 3 },
];

function FragmentoCard({ titulo, version, texto, activo = true, apagado = false }: { titulo: string; version: string; texto: string; activo?: boolean; apagado?: boolean }) {
  return (
    <div className={`rounded-otto border border-borde p-3.5 ${apagado ? 'bg-[#FBFAF7]' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex-1 font-serif text-[15px] font-semibold ${apagado ? 'text-grafito' : ''}`}>{titulo}</span>
        <span className="text-[11.5px] text-grafito">{version}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-grafito">
          {activo ? 'Activo' : 'Inactivo'}
          <Switch defaultChecked={activo} />
        </span>
        <button className="rounded-[7px] border border-borde bg-lino px-3 py-1.5 text-[12.5px] font-medium text-cobre">Editar</button>
      </div>
      <div className="mt-2 text-sm leading-[1.55] text-grafito">{texto}</div>
    </div>
  );
}

function BuscadorYPropuesta() {
  return (
    <>
      <div className="rounded-otto border border-borde bg-lino p-4">
        <div className="mb-2 text-[13px] font-medium text-grafito">Probá cómo lo encontraría un cliente</div>
        <div className="flex gap-2.5">
          <input defaultValue="cuanto se paga de seña" className="flex-1 rounded-otto border border-borde bg-hueso px-3 py-2.5 text-[14.5px] outline-none" />
          <button className="rounded-otto border border-cobre bg-lino px-4 py-2.5 text-[13.5px] font-medium text-cobre">Probar</button>
        </div>
        <div className="mt-3 flex items-baseline gap-2.5 border-t border-borde-suave pt-3 text-sm leading-[1.5]">
          <span className="flex-none rounded-pill bg-salvia-suave px-2.5 py-0.5 text-[11.5px] font-medium text-salvia">Encontrado</span>
          <span>
            <span className="font-serif text-[14px] font-semibold">Reserva y garantía</span> — «Para reservar se deja
            una seña del 30%. La garantía es con DNI y tarjeta…»
          </span>
        </div>
      </div>
      <div className="flex gap-3.5 rounded-otto border border-cobre bg-lino p-4">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-pill bg-noche font-serif text-base font-semibold text-hueso">
          L
        </div>
        <div className="flex-1">
          <div className="font-serif text-[15px] font-semibold">
            Propuestas de Lucía{' '}
            <span className="ml-1.5 rounded-pill bg-cobre-claro px-2.5 py-0.5 text-[11.5px] font-medium text-cobre">2 nuevas</span>
          </div>
          <div className="mt-1.5 text-sm leading-[1.55]">
            Esta semana 6 clientes preguntaron si se puede alquilar <strong>solo el saco</strong> y no tengo
            respuesta. Propongo el fragmento «Saco solo»:{' '}
            <span className="text-grafito">«Alquilamos el ambo completo; el saco solo únicamente en línea informal, desde $80.000.»</span>
          </div>
          <div className="mt-3 flex gap-2.5">
            <button className="rounded-otto bg-cobre px-4 py-2 text-[13px] font-medium text-lino">Aplicar</button>
            <button className="rounded-otto border border-borde bg-lino px-4 py-2 text-[13px] font-medium">Editar y aplicar</button>
            <button className="px-4 py-2 text-[13px] font-medium text-grafito">Descartar</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ConocimientoPage() {
  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 flex-col overflow-hidden px-7 py-5.5 md:flex">
        <div className="mb-4 flex max-w-[940px] items-center">
          <div className="flex-1 font-serif text-[22px] font-semibold">Conocimiento</div>
          <button className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">Nuevo fragmento</button>
        </div>
        <div className="flex max-w-[940px] flex-col gap-3.5 overflow-y-auto">
          <BuscadorYPropuesta />
          <div className="overflow-hidden rounded-otto border border-borde">
            {SECCIONES.map((s) => (
              <div key={s.titulo} className="border-b border-borde-suave last:border-b-0">
                <div className={`flex items-center gap-2.5 px-4.5 py-3.5 text-[14.5px] font-medium ${s.abierta ? 'bg-[#FBFAF7]' : ''}`}>
                  <span className={s.abierta ? 'text-cobre' : 'text-grafito'}>{s.abierta ? '▾' : '▸'}</span>
                  {s.titulo}
                  <span className="ml-auto text-xs text-grafito">{s.n}</span>
                </div>
                {s.titulo === 'Reserva y garantía' && (
                  <div className="py-1 pb-4 pl-9.5 pr-4.5">
                    <FragmentoCard titulo="Reserva y garantía" version="v4 · 02/09" texto="Para reservar se deja una seña del 30%. La garantía es con DNI y tarjeta; se devuelve al entregar la prenda en condiciones." />
                  </div>
                )}
                {s.titulo === 'Objeciones' && (
                  <div className="flex flex-col gap-2.5 py-1 pb-4 pl-9.5 pr-4.5">
                    <FragmentoCard titulo="Objeción: es caro" version="v2 · 15/08" texto="Anclar el valor: a medida, sastrería incluida, tintorería incluida. Comparar con el costo de compra de un traje equivalente." />
                    <FragmentoCard titulo="Objeción: lo voy a pensar" version="v1 · 15/08" activo={false} apagado texto="Validar, no presionar. Ofrecer agendar una prueba sin compromiso: «te lo probás y decidís viéndote al espejo»." />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-3 pt-[18px] font-serif text-[22px] font-semibold">Conocimiento</div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <div className="rounded-otto border border-borde bg-lino p-3.5">
            <div className="mb-1.5 text-[12.5px] font-medium text-grafito">Probá cómo lo encontraría un cliente</div>
            <input defaultValue="cuanto se paga de seña" className="w-full rounded-otto border border-borde bg-hueso px-2.5 py-2 text-sm outline-none" />
            <div className="mt-2.5 flex items-baseline gap-2 text-[13px]">
              <span className="flex-none rounded-pill bg-salvia-suave px-2 py-0.5 text-[11px] font-medium text-salvia">Encontrado</span>
              <span>
                <span className="font-serif text-[13px] font-semibold">Reserva y garantía</span> — «seña del 30%…»
              </span>
            </div>
          </div>
          <div className="flex gap-2.5 rounded-otto border border-cobre bg-lino p-3.5">
            <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-noche font-serif text-xs font-semibold text-hueso">
              L
            </div>
            <div className="text-[13px] leading-[1.5]">
              <span className="font-serif text-[13.5px] font-semibold">Propuestas de Lucía · 2</span>
              <br />
              <span className="text-grafito">«Saco solo» y «Retiro en Roldán» esperan tu revisión.</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-otto border border-borde">
            {SECCIONES.map((s) => (
              <div key={s.titulo} className="flex items-center gap-2 border-b border-borde-suave px-3.5 py-3.5 text-sm font-medium last:border-b-0">
                <span className="text-grafito">▸</span>
                {s.titulo}
                <span className="ml-auto text-[11.5px] text-grafito">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
