'use client';

// Burbuja de mensaje — cliente · Lucía · mostrador. Ver DISENO.md § componentes, 3 y 4.
// La «i» de cada burbuja de Lucía es el gancho a la bitácora del turno
// (Bitacora.tsx): plegada por defecto, un clic la despliega debajo de la burbuja
// y otro la vuelve a plegar. Si el turno tuvo una barandilla, un error o una
// derivación, el mini resumen de una línea se ve al costado sin abrir nada.

import { useState, type ReactNode } from 'react';
import { Bitacora, type PasoBitacora } from './Bitacora';

export type ResumenTurno = {
  texto: string;
  /** Ámbar: barandilla o error. Ladrillo: derivación. */
  tono: 'ambar' | 'ladrillo';
};

export type BitacoraTurno = {
  pasos: PasoBitacora[];
  costo?: string;
  advertencias?: string[];
};

function Avatar({ letra, bg, fg }: { letra: string; bg: string; fg: string }) {
  return (
    <div
      className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-pill font-serif text-[14px] font-semibold md:text-[13px]"
      style={{ background: bg, color: fg }}
    >
      {letra}
    </div>
  );
}

// La «i» mide 24 px en el celular (se toca con el dedo) y 16 px desde md, como en el canvas.
const CLASES_I =
  'absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded-pill text-[14px] font-semibold leading-none md:h-4 md:w-4 md:text-[10px]';

const TONO_RESUMEN: Record<ResumenTurno['tono'], string> = {
  ambar: 'bg-ambar-suave text-ambar',
  ladrillo: 'bg-ladrillo-suave text-ladrillo',
};

function MiniResumen({ resumen, className = '' }: { resumen: ResumenTurno; className?: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-bloque px-[9px] py-1 text-[14px] font-medium md:text-xs ${TONO_RESUMEN[resumen.tono]} ${className}`}
    >
      ⚠ {resumen.texto}
    </span>
  );
}

export function BurbujaCliente({ texto, hora }: { texto: ReactNode; hora: string }) {
  return (
    <div className="max-w-[440px] self-start">
      <div className="rounded-[10px_10px_10px_3px] border border-borde bg-lino px-3.5 py-2.5 text-[15px] leading-[1.45]">
        {texto}
      </div>
      <div className="ml-1 mt-1 text-[14px] tabular-nums text-grafito md:text-[11px]">{hora}</div>
    </div>
  );
}

export function BurbujaLucia({
  texto,
  hora,
  destacada = false,
  resumen,
  bitacora,
}: {
  texto: ReactNode;
  hora: string;
  /** true cuando el mensaje necesitó una herramienta/decisión especial (la «i» se ve en Cobre) */
  destacada?: boolean;
  /** mini resumen de una línea al costado de la burbuja; solo si el turno tuvo algo que avisar */
  resumen?: ResumenTurno;
  /** bitácora del turno; si no viene, la «i» no se puede abrir */
  bitacora?: BitacoraTurno;
}) {
  const [abierta, setAbierta] = useState(false);
  const puedeAbrir = Boolean(bitacora);

  return (
    <div className="flex max-w-[640px] flex-col items-end self-end">
      {/* A 390 no hay lugar al costado: el mini resumen va arriba de la burbuja, en una línea. */}
      {resumen && <MiniResumen resumen={resumen} className="mb-1 mr-8 md:hidden" />}
      <div className="flex items-start gap-2.5">
        {resumen && <MiniResumen resumen={resumen} className="mt-2 hidden md:inline-block" />}
        <div className="flex max-w-[480px] items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="relative rounded-[10px_10px_3px_10px] bg-noche-suave px-3.5 py-2.5 pr-9 text-[15px] leading-[1.45] md:pr-7">
              {texto}
              {puedeAbrir ? (
                <button
                  type="button"
                  onClick={() => setAbierta((a) => !a)}
                  aria-expanded={abierta}
                  aria-label={abierta ? 'Plegar la bitácora del turno' : 'Ver la bitácora del turno'}
                  className={`${CLASES_I} cursor-pointer ${destacada ? 'bg-cobre text-lino' : 'border border-[#C6CBD4] text-grafito'}`}
                >
                  i
                </button>
              ) : (
                // Sin bitácora cargada la «i» es solo la marca visual del canvas: no se puede abrir.
                <span aria-hidden className={`${CLASES_I} ${destacada ? 'bg-cobre text-lino' : 'border border-[#C6CBD4] text-grafito'}`}>
                  i
                </span>
              )}
            </div>
            <div className="mr-1 mt-1 text-right text-[14px] tabular-nums text-grafito md:text-[11px]">{hora}</div>
            {abierta && bitacora && (
              <div className="mt-2">
                <Bitacora pasos={bitacora.pasos} costo={bitacora.costo} advertencias={bitacora.advertencias} />
              </div>
            )}
          </div>
          <Avatar letra="L" bg="#1F2A3C" fg="#F6F3EE" />
        </div>
      </div>
    </div>
  );
}

export function BurbujaMostrador({
  texto,
  hora,
  autor,
  inicial,
}: {
  texto: ReactNode;
  hora: string;
  autor: string;
  inicial: string;
}) {
  return (
    <div className="flex max-w-[360px] gap-2 self-end">
      <div>
        <div className="rounded-[10px_10px_3px_10px] bg-cobre-claro px-3.5 py-2.5 text-[14.5px] leading-[1.45]">
          {texto}
        </div>
        <div className="mr-1 mt-1 text-right text-[14px] tabular-nums text-grafito md:text-[11px]">
          <span className="mr-1 rounded border border-[#E9D9C4] bg-lino px-[5px] py-px text-[14px] font-semibold text-cobre md:text-[10px]">
            MOSTRADOR
          </span>
          {autor} · {hora}
        </div>
      </div>
      <Avatar letra={inicial} bg="#F1E6D9" fg="#A8703F" />
    </div>
  );
}
