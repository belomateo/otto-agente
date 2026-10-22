'use client';

// Grabar un audio en el navegador y mandarlo por WhatsApp (pedido de Sofía, 22/10). Un toque
// empieza a grabar, otro lo manda; ✕ lo descarta. WhatsApp acepta ogg/opus, mp4 (aac), mpeg,
// aac y amr, pero NO webm: se prueba en este orden y si el navegador solo da webm (Chrome viejo)
// se avisa en vez de grabar algo que Meta va a rechazar. En mp4 se pide AAC primero porque Chrome
// también graba opus adentro de mp4, y eso WhatsApp no lo garantiza.

import { useRef, useState } from 'react';
import { IconAudio } from '@/components/nav/icons';

const FORMATOS = ['audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus'];
const MAXIMO_SEGUNDOS = 10 * 60; // ~10 min en opus/aac queda lejos de los 16 MB de WhatsApp

function formatoQueSirve(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const elegido = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
  return elegido && !elegido.startsWith('audio/webm') ? elegido : null;
}

export function GrabarAudio({ deshabilitado, compacto, onListo, onAviso }: {
  deshabilitado: boolean;
  compacto: boolean;
  onListo: (audio: Blob) => void;
  onAviso: (mensaje: string) => void;
}) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const grabador = useRef<MediaRecorder | null>(null);
  const descartar = useRef(false);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  async function empezar() {
    const formato = formatoQueSirve();
    if (!formato) {
      onAviso('Este navegador no puede grabar audios en un formato que acepte WhatsApp. Probá con Chrome actualizado, Safari o Firefox.');
      return;
    }
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onAviso('No hay permiso para usar el micrófono.');
      return;
    }
    const r = new MediaRecorder(flujo, { mimeType: formato });
    const partes: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && partes.push(e.data);
    r.onstop = () => {
      flujo.getTracks().forEach((t) => t.stop());
      if (reloj.current) clearInterval(reloj.current);
      setGrabando(false);
      if (!descartar.current && partes.length) onListo(new Blob(partes, { type: r.mimeType || formato }));
    };
    descartar.current = false;
    grabador.current = r;
    r.start();
    setSegundos(0);
    setGrabando(true);
    reloj.current = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAXIMO_SEGUNDOS) grabador.current?.stop();
        return s + 1;
      });
    }, 1000);
  }

  function parar(tirar: boolean) {
    descartar.current = tirar;
    grabador.current?.stop();
  }

  if (grabando) {
    return (
      <div className="flex flex-none items-center gap-1.5 text-[13px] text-ladrillo">
        <span aria-live="polite">● {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</span>
        <button type="button" onClick={() => parar(true)} aria-label="Descartar el audio" className="px-1 text-grafito">✕</button>
        <button type="button" onClick={() => parar(false)} aria-label="Mandar el audio" className="rounded-otto bg-cobre px-2.5 py-1 font-medium text-lino">Mandar</button>
      </div>
    );
  }

  return compacto ? (
    <button type="button" onClick={empezar} disabled={deshabilitado} aria-label="Grabar un audio" className="flex-none disabled:opacity-50">
      <IconAudio className="text-grafito" width={20} height={20} />
    </button>
  ) : (
    <button
      type="button"
      onClick={empezar}
      disabled={deshabilitado}
      aria-label="Grabar un audio"
      className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde disabled:opacity-45"
    >
      <IconAudio className="text-grafito" />
    </button>
  );
}
