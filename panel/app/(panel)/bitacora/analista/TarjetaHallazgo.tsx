'use client';

// Un error o una mejora del analista de charlas (Bitácora › Analista, 0102). La cita va con el color
// de quien la dijo, como en la Bandeja (Lucía en Noche suave, el cliente en Lino con borde), y un
// link a la charla entera. «Hecho» y «Descartar» solo para admin: la API (PATCH
// /api/bitacora/analista/[id]) y la RLS de 0102 lo exigen igual; acá es para no mostrar un botón que
// no anda. Marcar no toca a Lucía: es la lista de lo que falta resolver.

import Link from 'next/link';
import { useState } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useUsuario } from '@/components/nav/UsuarioContext';
import { Chip } from '@/components/ui-otto/Chip';
import { ETIQUETA_TEMA } from '@/lib/etiquetas';
import type { EstadoHallazgo, HallazgoAnalista } from '@/lib/queries/analista';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobre';
const BOTON = `flex-none rounded-otto px-3 py-1.5 text-[14px] font-medium disabled:opacity-50 md:text-[13px] ${FOCO}`;

// Ladrillo es «error» y Cobre claro el acento suave de la paleta (DISENO.md): una mejora es una
// sugerencia, no algo que salió mal.
const CHIP_TIPO = {
  error: { bg: '#F6E3DF', fg: '#A6473A' },
  mejora: { bg: '#F1E6D9', fg: '#A8703F' },
};
const GRAVEDAD = {
  alta: { texto: 'Grave', clase: 'text-ladrillo' },
  media: { texto: 'Media', clase: 'text-ambar' },
  baja: { texto: 'Leve', clase: 'text-grafito' },
};

export function TarjetaHallazgo({ h, onCambio }: { h: HallazgoAnalista; onCambio: () => void }) {
  const esAdmin = useUsuario()?.rol === 'admin';
  const [enviando, setEnviando] = useState<EstadoHallazgo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resuelto = h.estado !== 'pendiente';

  async function marcar(estado: EstadoHallazgo) {
    setEnviando(estado);
    setError(null);
    try {
      await enviar(`/api/bitacora/analista/${h.id}`, 'PATCH', { estado });
      onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    } finally {
      setEnviando(null);
    }
  }

  const delCliente = h.autor_cita === 'cliente';
  return (
    <article className={`rounded-otto border border-borde bg-lino p-4 shadow-otto ${resuelto ? 'opacity-80' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip bg={CHIP_TIPO[h.tipo].bg} fg={CHIP_TIPO[h.tipo].fg}>
          {h.etiqueta}
        </Chip>
        {h.gravedad && (
          <span className={`text-[14px] font-medium md:text-[12.5px] ${GRAVEDAD[h.gravedad].clase}`}>● {GRAVEDAD[h.gravedad].texto}</span>
        )}
        {h.tema && <Chip>Ficha: {ETIQUETA_TEMA[h.tema] ?? h.tema}</Chip>}
        <span className="ml-auto min-w-0 truncate text-[14px] text-grafito md:text-[13px]">
          <span className="font-serif font-semibold text-tinta">{h.cliente}</span>
          {h.hora ? ` · ${h.hora}` : ''}
        </span>
      </div>

      {h.cita && (
        <blockquote
          className={`mt-3 rounded-bloque px-3 py-2 text-[14px] leading-[1.5] md:text-[13.5px] ${
            delCliente ? 'border border-borde bg-lino text-tinta' : 'bg-noche-suave text-noche'
          }`}
        >
          «{h.cita}»
          <div className="mt-1 text-[13px] text-grafito md:text-[12px]">{delCliente ? 'Mensaje del cliente' : 'Mensaje de Lucía'}</div>
        </blockquote>
      )}

      <div className="mt-3 flex flex-col gap-2 text-[14px] leading-[1.55] md:text-[13.5px]">
        <p>
          <span className="font-semibold">{h.tipo === 'error' ? 'Qué estuvo mal: ' : 'Qué faltó: '}</span>
          {h.que_paso}
        </p>
        {h.que_conviene && (
          <p>
            <span className="font-semibold">Qué conviene: </span>
            {h.que_conviene}
          </p>
        )}
        {h.texto_sugerido && (
          <div>
            <div className="font-semibold">{h.categoria === 'dato_faltante' ? 'Texto sugerido para la ficha:' : 'Cómo lo diría:'}</div>
            <p className="mt-1 whitespace-pre-wrap rounded-bloque border border-dashed border-borde bg-hueso px-3 py-2">{h.texto_sugerido}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/bandeja/charla?id=${h.conversacion_id}`} className={`text-[14px] font-medium text-cobre underline-offset-2 hover:underline md:text-[13px] ${FOCO}`}>
          Ver la charla →
        </Link>
        <span className="flex-1" />
        {!resuelto && esAdmin && (
          <>
            <button type="button" onClick={() => marcar('descartado')} disabled={enviando !== null} className={`${BOTON} border border-borde bg-lino text-grafito`}>
              {enviando === 'descartado' ? 'Guardando…' : 'Descartar'}
            </button>
            <button type="button" onClick={() => marcar('hecho')} disabled={enviando !== null} className={`${BOTON} bg-cobre text-lino`}>
              {enviando === 'hecho' ? 'Guardando…' : 'Hecho'}
            </button>
          </>
        )}
        {resuelto && (
          <span className="flex flex-wrap items-center gap-2 text-[14px] text-grafito md:text-[13px]">
            <Chip bg={h.estado === 'hecho' ? '#E7EFE7' : '#EFEDE8'} fg={h.estado === 'hecho' ? '#5E7F62' : '#5C6068'}>
              {h.estado === 'hecho' ? 'Hecho' : 'Descartado'}
            </Chip>
            {[h.marcado_por, h.marcado].filter(Boolean).join(' · ')}
            {esAdmin && (
              <button
                type="button"
                onClick={() => marcar('pendiente')}
                disabled={enviando !== null}
                className={`text-cobre underline-offset-2 hover:underline disabled:opacity-50 ${FOCO}`}
              >
                {enviando === 'pendiente' ? 'Guardando…' : 'Deshacer'}
              </button>
            )}
          </span>
        )}
      </div>
      {error && (
        <div role="alert" className="mt-2 text-[13px] text-ladrillo">
          {error}
        </div>
      )}
    </article>
  );
}
