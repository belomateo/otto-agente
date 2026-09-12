'use client';

// Lista de conversaciones, compartida por la vista de escritorio (columna fija
// de 360px) y la vista mobile (pantalla completa, m-bandeja.html). En mobile
// cada fila navega a /bandeja/charla; en desktop la fila activa ya muestra el
// hilo al lado, así que el click no hace nada todavía (Fase 2: seleccionar
// otra conversación).

import Link from 'next/link';
import { Chip } from '@/components/ui-otto/Chip';
import { convos } from '@/lib/mock-data';

const FILTROS = ['Todas', 'Con Lucía', 'Con persona', 'Sin respuesta'];

export function ConversationList({ variante }: { variante: 'desktop' | 'mobile' }) {
  return (
    <div
      className={
        variante === 'desktop'
          ? 'flex w-lista flex-none flex-col border-r border-borde bg-lino'
          : 'flex flex-1 flex-col bg-lino'
      }
    >
      <div className="border-b border-borde-suave px-4 pb-3 pt-[18px]">
        <div className="mb-3 font-serif text-[22px] font-semibold">Bandeja</div>
        <input
          placeholder={variante === 'desktop' ? 'Buscar por nombre o mensaje' : 'Buscar'}
          className="w-full rounded-otto border border-borde bg-hueso px-3 py-2.5 text-sm outline-none"
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5 overflow-hidden">
          {FILTROS.map((f, i) => (
            <span
              key={f}
              className="flex-none rounded-pill px-[11px] py-[5px] text-[12.5px] font-medium"
              style={
                i === 0
                  ? { background: '#A8703F', color: '#FFFFFF' }
                  : { border: '1px solid #E6E1D8', color: '#5C6068' }
              }
            >
              {f}
            </span>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {convos.map((c) => {
          const contenido = (
            <>
              <div className="flex items-baseline gap-2">
                <span className="flex-1 truncate font-serif text-[15px] font-semibold">{c.n}</span>
                <span className="text-xs tabular-nums text-grafito">{c.h}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex-1 truncate text-[13.5px] text-grafito">{c.m}</span>
                {c.hasTag && (
                  <span className="flex-none rounded-pill border border-borde px-2 py-0.5 text-[11px] font-medium text-grafito">
                    {c.tag}
                  </span>
                )}
                <Chip bg={c.cb} fg={c.cf} className="flex-none px-[9px] py-[2px] text-[11.5px]">
                  {c.chip}
                </Chip>
              </div>
            </>
          );
          const clases = 'border-b border-borde-suave px-4 py-[13px]';
          return variante === 'mobile' ? (
            <Link key={c.n} href="/bandeja/charla" className={clases} style={{ background: c.bg }}>
              {contenido}
            </Link>
          ) : (
            <div key={c.n} className={clases} style={{ background: c.bg }}>
              {contenido}
            </div>
          );
        })}
      </div>
    </div>
  );
}
