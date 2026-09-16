'use client';

// Lista de conversaciones, compartida por la vista de escritorio (columna fija de 360px) y la
// vista mobile (pantalla completa, m-bandeja.html). En mobile cada fila navega a
// /bandeja/charla?id=<id>; en desktop, a la fila que ya se está mostrando al lado (Fase 1:
// filtro y búsqueda son locales, sobre la lista ya pedida — sin pedirle de nuevo a la API en
// cada letra). Recibe los datos ya pedidos por la página (BandejaPage / la de /bandeja/charla):
// así un solo pedido sirve para las dos ramas (escritorio y mobile), que conviven en el DOM.

import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import type { FilaBandeja } from '@/lib/queries/bandeja';
import { VACIO_BANDEJA } from './vacio-bandeja';

const FILTROS: { label: string; pasa: (c: FilaBandeja) => boolean }[] = [
  { label: 'Todas', pasa: () => true },
  { label: 'Con Lucía', pasa: (c) => c.estado === 'activa' },
  { label: 'Con persona', pasa: (c) => c.estado === 'derivada' },
  { label: 'Sin respuesta', pasa: (c) => c.sin_respuesta && c.estado !== 'cerrada' },
];

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function ConversationList({
  variante,
  conversaciones,
  cargando,
  error,
  onReintentar,
  seleccionId = null,
  onSeleccionar,
}: {
  variante: 'desktop' | 'mobile';
  conversaciones: FilaBandeja[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  seleccionId?: string | null;
  /** Solo en escritorio: elegir la fila cambia lo que muestra el hilo al lado, sin navegar. */
  onSeleccionar?: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const q = normalizar(busqueda.trim());
  const lista = conversaciones.filter((c) => FILTROS[filtro].pasa(c) && (!q || normalizar(`${c.n} ${c.m}`).includes(q)));

  return (
    <div className={variante === 'desktop' ? 'flex w-lista flex-none flex-col border-r border-borde bg-lino' : 'flex min-w-0 flex-1 flex-col bg-lino'}>
      <div className="border-b border-borde-suave px-4 pb-3 pt-[18px]">
        <h1 className="mb-3 font-serif text-[22px] font-semibold">Bandeja</h1>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={variante === 'desktop' ? 'Buscar por nombre o mensaje' : 'Buscar'}
          aria-label="Buscar charlas"
          className="w-full rounded-otto border border-borde bg-hueso px-3 py-2.5 text-sm outline-none focus:border-cobre"
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {FILTROS.map((f, i) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFiltro(i)}
              aria-pressed={i === filtro}
              className="flex-none rounded-pill px-[11px] py-[5px] text-[14px] font-medium md:text-[12.5px]"
              style={i === filtro ? { background: '#A8703F', color: '#FFFFFF' } : { border: '1px solid #E6E1D8', color: '#5C6068' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {cargando && conversaciones.length === 0 ? (
          <Cargando />
        ) : error ? (
          <EstadoError mensaje={error} onReintentar={onReintentar} />
        ) : conversaciones.length === 0 ? (
          <EstadoVacio titulo={VACIO_BANDEJA.titulo} texto={VACIO_BANDEJA.texto} />
        ) : lista.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-grafito">Ninguna charla con ese filtro.</div>
        ) : (
          lista.map((c) => {
            const activa = c.id === seleccionId;
            const contenido = (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 truncate font-serif text-[15px] font-semibold">{c.n}</span>
                  <span className="text-[14px] tabular-nums text-grafito md:text-xs">{c.h}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] text-grafito md:text-[13.5px]">{c.m}</span>
                  {c.hasTag && <span className="flex-none rounded-pill border border-borde px-2 py-0.5 text-[14px] font-medium text-grafito md:text-[11px]">{c.tag}</span>}
                  <Chip bg={c.cb} fg={c.cf} className="flex-none px-[9px] py-[2px] text-[14px] md:text-[11.5px]">
                    {c.chip}
                  </Chip>
                </div>
              </>
            );
            const clases = `block w-full border-b border-borde-suave px-4 py-[13px] text-left ${activa ? 'bg-cobre-claro/50' : ''}`;
            return variante === 'mobile' ? (
              <Link key={c.id} href={`/bandeja/charla?id=${c.id}`} className={clases}>
                {contenido}
              </Link>
            ) : (
              <button key={c.id} type="button" onClick={() => onSeleccionar?.(c.id)} aria-current={activa ? 'true' : undefined} className={clases}>
                {contenido}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
