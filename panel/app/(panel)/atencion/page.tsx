'use client';

// Atención humana — conectada a GET /api/atencion?estado=pendiente|atendida (H1.8, paneles).
// Puerto de d-atencion.html (escritorio: lista + detalle) y m-atencion.html (mobile: solo
// tarjetas, sin detalle abierto — Fase 2 agrega el drill-in, como ya estaba planeado).
//
// `derivaciones` todavía no tiene la columna de resumen que pide PROCESOS.md § 4: mientras no
// exista, la tarjeta muestra el último mensaje del cliente tal cual, no un resumen armado.
// Marcar OK, Responder y Devolver a Lucía no tienen ruta en paneles todavía.

import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { BurbujaCliente, BurbujaLucia } from '@/components/ui-otto/Burbuja';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { useDatos } from '@/components/api/useDatos';
import type { EstadoDerivacion, FilaDerivacion } from '@/lib/queries/atencion';

const SIN_CONECTAR = 'Todavía no conectado';
const VACIOS: Record<EstadoDerivacion, { titulo: string; texto: string }> = {
  pendiente: { titulo: 'Todavía no hay derivaciones', texto: 'Lucía está atendiendo sola.' },
  atendida: { titulo: 'Todavía no hay consultas resueltas', texto: 'Cuando marques una derivación como OK, aparece acá.' },
};

type Respuesta = { derivaciones: FilaDerivacion[]; pendientes: number; atendidas: number };

function TarjetaDerivacion({ d, activa, onClick, compacta = false }: { d: FilaDerivacion; activa: boolean; onClick?: () => void; compacta?: boolean }) {
  const clases = `rounded-otto border bg-lino p-4 text-left shadow-otto ${onClick ? 'w-full' : ''}`;
  const estilo = { borderColor: activa ? '#A8703F' : '#E6E1D8' };
  const interior = (
    <>
      <div className="flex items-baseline gap-2.5">
        <span className="flex-1 font-serif text-base font-semibold">{d.n}</span>
        <span className="text-[14px] text-grafito md:text-xs">{d.hace}</span>
      </div>
      <div className="my-2">
        <Chip bg={d.cb} fg={d.cf} className="px-2.5 py-[3px]">
          {d.motivo}
        </Chip>
      </div>
      <div className={`text-[14px] leading-[1.5] text-grafito md:text-[13.5px] ${compacta ? '' : 'line-clamp-2'}`}>{d.resumen}</div>
      {compacta && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled title={SIN_CONECTAR} className="flex-1 rounded-otto bg-cobre/50 py-2.5 text-sm font-medium text-lino">
            Responder
          </button>
          <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto border border-salvia bg-lino px-4 py-2.5 text-sm font-medium text-salvia/50">
            ✓ OK
          </button>
        </div>
      )}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={clases} style={estilo}>
      {interior}
    </button>
  ) : (
    <div className={clases} style={estilo}>
      {interior}
    </div>
  );
}

export default function AtencionPage() {
  const [tab, setTab] = useState<EstadoDerivacion>('pendiente');
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const { datos, cargando, error, recargar } = useDatos<Respuesta>(`/api/atencion?estado=${tab}`);
  const lista = datos?.derivaciones ?? [];
  const pendientes = datos?.pendientes ?? 0;
  const atendidas = datos?.atendidas ?? 0;
  const principal = lista.find((d) => d.id === seleccionId) ?? lista[0] ?? null;

  const contenido =
    cargando && lista.length === 0 ? (
      <Cargando />
    ) : error ? (
      <EstadoError mensaje={error} onReintentar={recargar} />
    ) : lista.length === 0 ? (
      <EstadoVacio titulo={VACIOS[tab].titulo} texto={VACIOS[tab].texto} />
    ) : null;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex w-[420px] flex-none flex-col gap-3.5 border-r border-borde p-5">
          <div>
            <h1 className="font-serif text-[22px] font-semibold">Atención humana</h1>
            <div className="mt-2.5 flex gap-0.5 border-b border-borde text-[14px] font-medium md:text-[13.5px]">
              <button
                type="button"
                onClick={() => {
                  setTab('pendiente');
                  setSeleccionId(null);
                }}
                className={tab === 'pendiente' ? '-mb-px border-b-2 border-cobre px-3 py-2 text-cobre' : 'px-3 py-2 text-grafito'}
              >
                Pendientes{' '}
                <Chip bg={pendientes ? '#A6473A' : '#EFEDE8'} fg={pendientes ? '#FFFFFF' : '#5C6068'} className="ml-0.5 px-[7px] py-px text-[14px] font-semibold md:text-[11px]">
                  {pendientes}
                </Chip>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('atendida');
                  setSeleccionId(null);
                }}
                className={tab === 'atendida' ? '-mb-px border-b-2 border-cobre px-3 py-2 text-cobre' : 'px-3 py-2 text-grafito'}
              >
                Consultas OK <Chip className="ml-0.5 px-[7px] py-px text-[14px] font-semibold md:text-[11px]">{atendidas}</Chip>
              </button>
            </div>
          </div>
          {contenido ?? (
            <div className="flex flex-col gap-3.5">
              {lista.map((d) => (
                <TarjetaDerivacion key={d.id} d={d} activa={d.id === principal?.id} onClick={() => setSeleccionId(d.id)} />
              ))}
            </div>
          )}
        </div>
        {principal ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-borde bg-lino px-6 py-4">
              <div className="flex-1">
                <span className="font-serif text-lg font-semibold">{principal.n}</span>
                <Chip bg={principal.cb} fg={principal.cf} className="ml-2.5 px-2.5 py-[3px]">
                  {principal.motivo}
                </Chip>
              </div>
              <span className="text-[14px] text-grafito md:text-[12.5px]">{principal.hace}</span>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-5">
              <div className="rounded-otto border border-borde border-l-[3px] border-l-ladrillo bg-lino px-4 py-3 text-sm leading-[1.55]">
                <span className="font-semibold text-ladrillo">Último mensaje del cliente:</span> {principal.resumen}
              </div>
              {principal.ultimos_mensajes.length === 0 ? (
                <div className="text-[14px] text-grafito md:text-sm">Sin mensajes en esta charla todavía.</div>
              ) : (
                principal.ultimos_mensajes.map((m, i) =>
                  m.direccion === 'entrante' ? <BurbujaCliente key={i} texto={m.texto} hora={m.hora} /> : <BurbujaLucia key={i} texto={m.texto} hora={m.hora} />,
                )
              )}
              <div className="flex-1" />
              <textarea
                placeholder={`Escribile a ${principal.n.split(' ')[0]} — tu mensaje sale con la etiqueta «mostrador»`}
                aria-label="Respuesta del equipo"
                disabled
                title={SIN_CONECTAR}
                className="min-h-[96px] w-full resize-none rounded-otto border border-borde px-3.5 py-3 text-[14.5px] leading-[1.5] outline-none focus:border-cobre disabled:bg-hueso disabled:text-[#8A8578]"
              />
              <div className="flex items-center justify-between">
                <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto border border-salvia bg-lino px-4.5 py-2.5 text-sm font-medium text-salvia/50">
                  ✓ Marcar OK
                </button>
                <div className="flex gap-2.5">
                  <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto border border-cobre bg-lino px-4.5 py-2.5 text-sm font-medium text-cobre/50">
                    Devolver a Lucía
                  </button>
                  <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto bg-cobre/50 px-5 py-2.5 text-sm font-medium text-lino">
                    Responder
                  </button>
                </div>
              </div>
              <div className="text-[14px] text-grafito md:text-xs">
                {SIN_CONECTAR}: paneles todavía no tiene la ruta para marcar OK, responder o devolver una derivación a Lucía.
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
            <button type="button" onClick={() => setTab('pendiente')} className={`flex-1 py-2 text-center ${tab === 'pendiente' ? 'bg-cobre text-lino' : 'bg-lino text-grafito'}`}>
              Pendientes · {pendientes}
            </button>
            <button type="button" onClick={() => setTab('atendida')} className={`flex-1 py-2 text-center ${tab === 'atendida' ? 'bg-cobre text-lino' : 'bg-lino text-grafito'}`}>
              Consultas OK · {atendidas}
            </button>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {contenido ? <div className="rounded-otto border border-borde bg-lino">{contenido}</div> : lista.map((d) => <TarjetaDerivacion key={d.id} d={d} activa={false} compacta />)}
        </div>
      </div>
    </>
  );
}
