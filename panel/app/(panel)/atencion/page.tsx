'use client';

// Atención humana — conectada a GET /api/atencion?estado=pendiente|atendida (H1.8, paneles).
// Puerto de d-atencion.html (escritorio: lista + detalle) y m-atencion.html (mobile: solo
// tarjetas, sin detalle abierto — Fase 2 agrega el drill-in, como ya estaba planeado).
//
// `derivaciones` todavía no tiene la columna de resumen que pide PROCESOS.md § 4: mientras no
// exista, la tarjeta muestra el último mensaje del cliente tal cual, no un resumen armado.
//
// El detalle de escritorio reusa <ChatThread>: es la misma charla que Bandeja (tomar, devolver,
// cerrar y responder son acciones de la conversación, no de la derivación — PROCESOS.md § 4
// pasos 6 y 7) y así el hilo completo con la burbuja de mostrador sale gratis, sin repetir la
// lógica. La lista de acá se queda con lo que le sirve solo a ella: motivo, hace y el resumen.
// En mobile, sin detalle abierto todavía, la tarjeta linkea a /bandeja/charla?id=... (mismo
// hilo, mismas acciones) en vez de duplicar un lector/respondedor chico adentro de la tarjeta.

import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { SONDEO_LISTAS_MS, useDatos } from '@/components/api/useDatos';
import { ChatThread } from '../bandeja/ChatThread';
import type { EstadoDerivacion, FilaDerivacion } from '@/lib/queries/atencion';

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
        <div className="mt-3">
          <Link
            href={`/bandeja/charla?id=${d.conversacion_id}`}
            className="block rounded-otto bg-cobre py-2.5 text-center text-sm font-medium text-lino"
          >
            Ver y responder
          </Link>
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
  const { datos, cargando, error, recargar } = useDatos<Respuesta>(`/api/atencion?estado=${tab}`, { sondeoMs: SONDEO_LISTAS_MS });
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
            <div className="border-b border-borde bg-lino px-6 py-3.5">
              <div className="flex items-center gap-2.5">
                <Chip bg={principal.cb} fg={principal.cf} className="px-2.5 py-[3px]">
                  {principal.motivo}
                </Chip>
                <span className="text-[14px] text-grafito md:text-[12.5px]">{principal.hace}</span>
              </div>
              <div className="mt-1.5 text-sm leading-[1.5]">
                <span className="font-semibold text-ladrillo">Último mensaje del cliente:</span> {principal.resumen}
              </div>
            </div>
            <ChatThread variante="desktop" conversacionId={principal.conversacion_id} />
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
