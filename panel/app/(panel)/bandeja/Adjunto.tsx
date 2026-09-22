'use client';

// Audios y fotos de WhatsApp dentro de la burbuja (pedido original de Mateo, 19/9: "que
// aparezcan en el crm para que se puedan ver y escuchar directamente de ahi"). El backend
// (logica, 0055) ya bajaba y transcribía los adjuntos; lo que faltaba era esto. GET
// /api/medios/<mensaje_id> firma una URL de Storage que dura 90 segundos — por eso se pide
// recién al abrir la foto o darle play al audio, nunca al pintar la lista entera (si se pidiera
// una URL por cada mensaje con adjunto apenas se abre la charla, la mayoría vencería antes de
// que alguien las use). adjunto_estado decide qué se muestra: 'pendiente' es "todavía no
// llegó" (no un error), 'error' ofrece Reintentar (PATCH, misma ruta — encola el adjunto de
// nuevo), 'listo' es lo único que tiene con qué armar la URL.

import { useState } from 'react';
import { enviar, ErrorApi, obtener } from '@/components/api/cliente';
import type { MensajeCharla } from '@/lib/queries/bandeja';

type Adjunto = NonNullable<MensajeCharla['adjunto']>;

function formatoDuracion(seg: number | null): string | null {
  if (seg == null) return null;
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const BOTON = 'inline-flex items-center gap-1.5 rounded-otto border border-borde bg-lino/60 px-2.5 py-1.5 text-[14px] font-medium text-cobre disabled:opacity-60 md:text-[13.5px]';

export function ContenidoAdjunto({ mensajeId, adjunto }: { mensajeId: string; adjunto: Adjunto }) {
  const [estado, setEstado] = useState(adjunto.estado);
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esImagen = adjunto.mime.startsWith('image/');

  async function pedirUrl() {
    setCargando(true);
    setError(null);
    try {
      const r = await obtener<{ url: string; mime: string }>(`/api/medios/${mensajeId}`);
      setUrl(r.url);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo bajar el adjunto');
    } finally {
      setCargando(false);
    }
  }

  async function reintentar() {
    setCargando(true);
    setError(null);
    try {
      await enviar(`/api/medios/${mensajeId}`, 'PATCH');
      // Optimista: el sondeo de la charla (useDatos, SONDEO_LISTAS_MS) va a traer el estado
      // real (pendiente → listo) solo; esto es para no dejar el botón de Reintentar a la vista
      // mientras tanto.
      setEstado('pendiente');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo reintentar');
    } finally {
      setCargando(false);
    }
  }

  if (estado === 'pendiente') {
    return <div className="text-[15px] italic text-grafito md:text-[13.5px]">{esImagen ? '📷 Bajando la foto…' : '🎤 Bajando el audio…'}</div>;
  }

  if (estado === 'error') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <div className="text-[15px] text-ladrillo md:text-[13.5px]">{esImagen ? 'No se pudo bajar la foto.' : 'No se pudo bajar el audio.'}</div>
        <button type="button" onClick={reintentar} disabled={cargando} className={BOTON}>
          {cargando ? 'Reintentando…' : 'Reintentar'}
        </button>
        {error && <div className="text-[13px] text-ladrillo">{error}</div>}
      </div>
    );
  }

  // estado === 'listo'
  if (esImagen) {
    if (!url) {
      return (
        <button type="button" onClick={pedirUrl} disabled={cargando} className={BOTON}>
          📷 {cargando ? 'Abriendo…' : 'Ver foto'}
        </button>
      );
    }
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, no un asset de Next */}
        <img src={url} alt="Foto enviada por WhatsApp" className="max-h-[280px] max-w-[260px] rounded-otto border border-borde object-cover" />
      </a>
    );
  }

  const duracion = formatoDuracion(adjunto.segundos);
  return (
    <div className="flex flex-col items-start gap-1.5">
      {!url ? (
        <button type="button" onClick={pedirUrl} disabled={cargando} className={BOTON}>
          ▶ {cargando ? 'Cargando…' : `Reproducir audio${duracion ? ` · ${duracion}` : ''}`}
        </button>
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- audio de WhatsApp, sin pistas de subtítulos
        <audio controls autoPlay src={url} className="h-9 max-w-[260px]" />
      )}
      {adjunto.transcripcion && <div className="max-w-[280px] text-[13.5px] italic leading-[1.4] text-grafito">«{adjunto.transcripcion}»</div>}
      {error && <div className="text-[13px] text-ladrillo">{error}</div>}
    </div>
  );
}
