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
import { fechaEnZona, fechaLarga, sumarDias } from '@/lib/formato';

const VACIOS: Record<EstadoDerivacion, { titulo: string; texto: string }> = {
  pendiente: { titulo: 'Todavía no hay derivaciones', texto: 'Lucía está atendiendo sola.' },
  atendida: { titulo: 'No hay conversaciones', texto: 'Probá con otro día o buscá por nombre o teléfono.' },
};

type Respuesta = { derivaciones: FilaDerivacion[]; pendientes: number; atendidas: number };

// Consultas OK = el historial de todas las conversaciones (Sofía, 18/11), por secciones: un día por vez, o una
// búsqueda por nombre o teléfono en todo el historial. Así nunca se cargan miles juntas.
function ControlesHistorial({ dia, setDia, busqueda, setBusqueda }: { dia: string; setDia: (d: string) => void; busqueda: string; setBusqueda: (b: string) => void }) {
  const [texto, setTexto] = useState(busqueda);
  const hoy = fechaEnZona();
  const flecha = 'rounded-otto border border-borde bg-lino px-3 py-1.5 text-sm disabled:opacity-40';
  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusqueda(texto.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (!e.target.value) setBusqueda('');
          }}
          placeholder="Buscar por nombre o teléfono"
          aria-label="Buscar por nombre o teléfono"
          className="min-w-0 flex-1 rounded-otto border border-borde bg-lino px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-otto bg-cobre px-3 py-1.5 text-sm font-medium text-lino">
          Buscar
        </button>
      </form>
      {busqueda ? (
        <div className="text-[13px] text-grafito">
          Resultados de «{busqueda}» en todo el historial ·{' '}
          <button type="button" className="underline" onClick={() => { setTexto(''); setBusqueda(''); }}>
            volver por día
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" className={flecha} onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior">
            ◀
          </button>
          <input
            type="date"
            value={dia}
            max={hoy}
            onChange={(e) => e.target.value && setDia(e.target.value)}
            aria-label="Día"
            className="min-w-0 flex-1 rounded-otto border border-borde bg-lino px-3 py-1.5 text-sm"
          />
          <button type="button" className={flecha} disabled={dia >= hoy} onClick={() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente">
            ▶
          </button>
        </div>
      )}
      {!busqueda && <div className="text-[13px] font-medium text-grafito">{dia === hoy ? 'Hoy' : fechaLarga(dia)}</div>}
    </div>
  );
}

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
  const [dia, setDia] = useState(() => fechaEnZona());
  const [busqueda, setBusqueda] = useState('');
  const ruta = tab === 'pendiente' ? '/api/atencion?estado=pendiente' : `/api/atencion?estado=atendida&dia=${dia}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''}`;
  // El historial no se refresca solo: es un día ya pasado o una búsqueda puntual.
  const { datos, cargando, error, recargar } = useDatos<Respuesta>(ruta, { sondeoMs: tab === 'pendiente' ? SONDEO_LISTAS_MS : undefined });
  const lista = datos?.derivaciones ?? [];
  const pendientes = datos?.pendientes ?? 0;
  const controles = tab === 'atendida' && (
    <ControlesHistorial
      dia={dia}
      setDia={(d) => { setDia(d); setSeleccionId(null); }}
      busqueda={busqueda}
      setBusqueda={(b) => { setBusqueda(b); setSeleccionId(null); }}
    />
  );
  const tope = tab === 'atendida' && lista.length >= 200 && (
    <div className="text-center text-[13px] text-grafito">Se muestran las 200 más recientes: buscá por nombre o teléfono para encontrar otra.</div>
  );
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
      <div className="hidden min-h-0 flex-1 md:flex">
        <div className="flex min-h-0 w-[420px] flex-none flex-col gap-3.5 border-r border-borde p-5">
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
                Consultas OK
              </button>
            </div>
          </div>
          {controles}
          {contenido ?? (
            // 14/11: la lista baja sola, sin arrastrar la charla de al lado.
            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-1 pb-1">
              {lista.map((d) => (
                <TarjetaDerivacion key={d.id} d={d} activa={d.id === principal?.id} onClick={() => setSeleccionId(d.id)} />
              ))}
              {tope}
            </div>
          )}
        </div>
        {principal ? (
          <div className="flex min-h-0 flex-1 flex-col">
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
              Consultas OK
            </button>
          </div>
          {controles && <div className="mt-3">{controles}</div>}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {contenido ? <div className="rounded-otto border border-borde bg-lino">{contenido}</div> : lista.map((d) => <TarjetaDerivacion key={d.id} d={d} activa={false} compacta />)}
          {!contenido && tope}
        </div>
      </div>
    </>
  );
}
