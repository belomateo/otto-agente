'use client';

// Hilo de una charla — conectado a GET /api/bandeja/<id> (H1.8, paneles). Compartido por la
// vista de escritorio (al lado de la lista) y la de mobile (/bandeja/charla). La bitácora va
// plegada y se abre desde la «i» (Burbuja.tsx); el mini resumen se ve al costado sin abrir
// nada. Tomar / Devolver a Lucía / Cerrar / Responder van contra /api/bandeja/<id>/... (H1.8,
// paneles, PROCESOS.md § 4 pasos 6 y 7): tomar y devolver solo valen si la charla no está
// cerrada; responder (mostrador_enviar) solo si está 'derivada' y hubo un mensaje del cliente
// en las últimas 24 hs — el 409 de la base explica el motivo exacto si no se puede.
//
// Mandar una foto (POST /api/bandeja/<id>/foto, multipart, mismas reglas que responder) pedido
// de Mateo 16/9, ítem 3: mismo botón que ya estaba pero desconectado. Falta que paneles exponga
// una URL en la lectura de mensajes para mostrar la foto en la burbuja — hasta entonces se
// avisa "Foto" en vez del texto crudo. El de audio sigue sin conectar, no era parte del pedido.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BurbujaCliente, BurbujaLucia, BurbujaMostrador } from '@/components/ui-otto/Burbuja';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { IconAudio, IconFoto } from '@/components/nav/icons';
import { useUsuario } from '@/components/nav/UsuarioContext';
import { SONDEO_LISTAS_MS, useDatos } from '@/components/api/useDatos';
import { useAccionesCharla } from '@/components/api/useAccionesCharla';
import { fechaEnZona } from '@/lib/formato';
import type { Charla } from '@/lib/queries/bandeja';

// La ventana de WhatsApp se puede cerrar entre que se escribe un mensaje y que el worker lo
// toma (segundos después, paneles 0042/logica): el mensaje queda en la charla pero nunca sale.
// Misma recomendación que el 409 de mostrador_enviar (useAccionesCharla): escribirle al
// cliente desde otro número, solo cuando el motivo es la ventana cerrada.
function AvisoNoEnviado({ motivo }: { motivo: 'ventana_cerrada' | 'error_al_enviar' }) {
  return (
    <div className="mr-1 self-end text-right text-[14px] leading-[1.4] text-ladrillo md:text-[13px]">
      <div>No se pudo enviar.</div>
      {motivo === 'ventana_cerrada' && <div className="font-medium">Probá escribirle al cliente desde otro número.</div>}
    </div>
  );
}

// Sin webp: WhatsApp no lo acepta y las dos rutas de subida (acá y catalogo/EdicionModelo.tsx)
// ya lo rechazan del lado del servidor — ofrecerlo en el picker solo hace que la persona elija
// la foto y recién ahí se entere de que no sirve.
const TIPOS_FOTO_ACEPTADOS = 'image/jpeg,image/png';

// Todavía no hay URL para mostrar la foto en la burbuja (paneles: la lectura de mensajes no la
// expone), tampoco para las que manda el cliente — se avisa que es una foto en vez de mostrar
// el texto crudo "(imagen)" que arma textoDeMensaje.
function textoDeBurbuja(m: { tipo: string; texto: string }) {
  return m.tipo === 'imagen' ? '📷 Foto' : m.texto;
}

function separador(fecha: string) {
  // fechaEnZona(), no new Date().toISOString(): entre las 21:00 y la medianoche en Rosario
  // (ART, -03:00) la fecha UTC ya es la de mañana, y los mensajes de hoy quedaban separados
  // bajo el título equivocado.
  if (fecha === fechaEnZona()) return 'Hoy';
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Bitácora de la charla, a partir de eventos_agente (H1.11, logica): la forma exacta de
// `detalle` la define agente y todavía no está fijada, así que se muestra tal cual viene
// (el texto si es texto, o el JSON) en vez de inventarle un formato. Se cuelga del último
// mensaje de Lucía, no de uno en particular: no hay forma confiable de saber a qué mensaje
// exacto corresponde cada evento sin esa definición.
function bitacoraDe(charla: Charla) {
  if (charla.eventos.length === 0) return undefined;
  return {
    pasos: charla.eventos.map((e) => ({
      tipo: e.tipo === 'error' ? ('error' as const) : e.tipo === 'pensamiento' ? ('pensamiento' as const) : ('ok' as const),
      texto: typeof e.detalle === 'string' ? e.detalle : JSON.stringify(e.detalle),
      codigo: e.tipo === 'herramienta',
    })),
  };
}

function resumenDe(charla: Charla) {
  const barandilla = charla.eventos.find((e) => e.tipo === 'barandilla');
  if (barandilla) return { tono: 'ambar' as const, texto: typeof barandilla.detalle === 'string' ? barandilla.detalle : 'Barandilla' };
  const derivacion = charla.eventos.find((e) => e.tipo === 'derivacion');
  if (derivacion) return { tono: 'ladrillo' as const, texto: typeof derivacion.detalle === 'string' ? derivacion.detalle : 'Derivado' };
  return undefined;
}

export function ChatThread({ variante, conversacionId }: { variante: 'desktop' | 'mobile'; conversacionId: string | null }) {
  const compacto = variante === 'mobile';
  const esAdmin = useUsuario()?.rol === 'admin';
  const { datos: charla, cargando, error, recargar } = useDatos<Charla>(conversacionId ? `/api/bandeja/${conversacionId}` : null, { sondeoMs: SONDEO_LISTAS_MS });
  const { enviando, error: errorAccion, motivo: motivoAccion, tomar, devolver, cerrar, responder, enviarFoto } = useAccionesCharla(conversacionId);
  const [texto, setTexto] = useState('');
  const inputFotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto('');
  }, [conversacionId]);

  if (!conversacionId) return <div className="flex-1 bg-hueso" />;
  if (cargando && !charla) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!charla) return null;

  const bitacora = bitacoraDe(charla);
  const resumen = resumenDe(charla);
  const ultimoLuciaId = [...charla.mensajes].reverse().find((m) => m.autor === 'lucia')?.id;

  async function onTomar() {
    if (await tomar()) recargar();
  }
  async function onDevolver() {
    if (await devolver()) recargar();
  }
  async function onCerrar() {
    if (await cerrar()) recargar();
  }
  async function onResponder() {
    const t = texto.trim();
    if (!t) return;
    if (await responder(t)) {
      setTexto('');
      recargar();
    }
  }
  async function onFotoElegida(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!archivo) return;
    if (await enviarFoto(archivo)) recargar();
  }

  let fechaAnterior = '';

  return (
    // min-w-0: sin esto el texto truncado de abajo fija el ancho mínimo del hilo y la página desborda de costado.
    <div className="flex min-w-0 flex-1 flex-col bg-hueso">
      <div className={`flex items-center gap-4 border-b border-borde bg-lino ${compacto ? 'p-3.5' : 'px-6 py-3.5'}`}>
        {compacto && (
          <Link href="/bandeja" aria-label="Volver a la bandeja" className="text-xl text-grafito">
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
            <span className="font-serif text-[17px] font-semibold">{charla.cliente.nombre}</span>
            {!compacto && charla.cliente.resumen && <span className="text-[14px] text-grafito md:text-[13px]">{charla.cliente.resumen}</span>}
          </div>
          {compacto ? (
            <div className="truncate text-[14px] text-grafito md:text-xs">
              {charla.cliente.resumen || charla.cliente.telefono}
              {charla.cliente.email && ` · ${charla.cliente.email}`}
            </div>
          ) : (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[14px] text-grafito md:text-xs">
              <span className="inline-block h-[7px] w-[7px] rounded-pill bg-noche" />
              La charla la tiene {charla.quien}
              {charla.cliente.email && <span className="ml-1">· {charla.cliente.email}</span>}
              {charla.cliente.etiqueta && <span className="ml-2 rounded-pill border border-borde px-2 py-0.5 text-[14px] md:text-[11px]">{charla.cliente.etiqueta}</span>}
              <span title="Todavía no conectado" className="cursor-not-allowed rounded-pill border border-dashed border-[#C9C4B9] px-2 py-0.5 text-[14px] text-[#8A8578] md:text-[11px]">
                + Etiqueta
              </span>
            </div>
          )}
        </div>
        {!compacto ? (
          <>
            {esAdmin && (
              <Link href={`/clientes?id=${charla.cliente.id}`} className="flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium md:text-[13.5px]">
                Ver ficha
              </Link>
            )}
            {charla.estado !== 'cerrada' && (
              <button
                type="button"
                onClick={onCerrar}
                disabled={enviando}
                className="flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium text-grafito disabled:opacity-50 md:text-[13.5px]"
              >
                Cerrar
              </button>
            )}
            {charla.estado === 'activa' && (
              <button type="button" onClick={onTomar} disabled={enviando} className="flex-none rounded-otto bg-cobre px-4 py-2 text-[14px] font-medium text-lino disabled:opacity-60 md:text-[13.5px]">
                Tomar la charla
              </button>
            )}
            {charla.estado === 'derivada' && (
              <button
                type="button"
                onClick={onDevolver}
                disabled={enviando}
                className="flex-none rounded-otto border border-cobre bg-lino px-3.5 py-2 text-[14px] font-medium text-cobre disabled:opacity-50 md:text-[13.5px]"
              >
                Devolver a Lucía
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-none items-center gap-2.5">
            <span className="rounded-pill bg-noche-suave px-2.5 py-[3px] text-[14px] font-medium text-noche md:text-[11.5px]">{charla.quien}</span>
            {charla.estado !== 'cerrada' && (
              <button type="button" onClick={onCerrar} disabled={enviando} className="text-[13px] font-medium text-ladrillo disabled:opacity-50">
                Cerrar
              </button>
            )}
          </div>
        )}
      </div>

      {compacto && (
        <div className="flex gap-2 border-b border-borde bg-lino p-3.5 pt-0">
          {esAdmin && (
            <Link href={`/clientes?id=${charla.cliente.id}`} className="flex-1 rounded-otto border border-borde bg-lino py-2 text-center text-[14px] font-medium md:text-[13px]">
              Ver ficha
            </Link>
          )}
          {charla.estado === 'activa' && (
            <button type="button" onClick={onTomar} disabled={enviando} className="flex-1 rounded-otto bg-cobre py-2 text-[14px] font-medium text-lino disabled:opacity-60 md:text-[13px]">
              Tomar la charla
            </button>
          )}
          {charla.estado === 'derivada' && (
            <button
              type="button"
              onClick={onDevolver}
              disabled={enviando}
              className="flex-1 rounded-otto border border-cobre bg-lino py-2 text-[14px] font-medium text-cobre disabled:opacity-50 md:text-[13px]"
            >
              Devolver a Lucía
            </button>
          )}
        </div>
      )}

      <div className={`flex flex-1 flex-col gap-3.5 overflow-y-auto ${compacto ? 'p-4' : 'px-7 py-5.5'}`}>
        {charla.mensajes.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay mensajes" texto="Cuando el cliente escriba, los mensajes aparecen acá." />
        ) : (
          charla.mensajes.map((m) => {
            const nuevoDia = m.fecha !== fechaAnterior;
            fechaAnterior = m.fecha;
            const esUltimoLucia = m.id === ultimoLuciaId;
            return (
              <div key={m.id} className="contents">
                {!compacto && nuevoDia && <span className="self-center rounded-pill bg-[#EFEBE3] px-3 py-[3px] text-[14px] text-grafito md:text-xs">{separador(m.fecha)}</span>}
                {m.autor === 'cliente' ? (
                  <BurbujaCliente texto={textoDeBurbuja(m)} hora={m.hora} />
                ) : m.autor === 'mostrador' ? (
                  <BurbujaMostrador texto={textoDeBurbuja(m)} hora={m.hora} autor="Equipo" inicial="E" />
                ) : (
                  <BurbujaLucia texto={textoDeBurbuja(m)} hora={m.hora} resumen={esUltimoLucia ? resumen : undefined} bitacora={esUltimoLucia ? bitacora : undefined} />
                )}
                {m.no_enviado_motivo && <AvisoNoEnviado motivo={m.no_enviado_motivo} />}
              </div>
            );
          })
        )}
      </div>

      {errorAccion && (
        <div className={`text-[14px] text-ladrillo md:text-[13px] ${compacto ? 'px-3.5 pt-2' : 'px-6 pt-2'}`}>
          <div>{errorAccion}</div>
          {motivoAccion === 'ventana_cerrada' && <div className="mt-0.5 font-medium">Probá escribirle al cliente desde otro número.</div>}
        </div>
      )}

      <div className={`flex items-center gap-2.5 border-t border-borde bg-lino ${compacto ? 'px-3.5 pb-[22px] pt-2.5' : 'px-6 py-3.5'}`}>
        <input ref={inputFotoRef} type="file" accept={TIPOS_FOTO_ACEPTADOS} className="hidden" onChange={onFotoElegida} />
        {!compacto ? (
          <>
            <button
              type="button"
              onClick={() => inputFotoRef.current?.click()}
              disabled={charla.estado !== 'derivada' || enviando}
              aria-label="Mandar una foto"
              className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde disabled:opacity-45"
            >
              <IconFoto className="text-grafito" />
            </button>
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde opacity-45">
              <IconAudio className="text-grafito" />
            </span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => inputFotoRef.current?.click()} disabled={charla.estado !== 'derivada' || enviando} aria-label="Mandar una foto" className="flex-none disabled:opacity-50">
              <IconFoto className="text-grafito" width={20} height={20} />
            </button>
            <span className="flex-none opacity-50">
              <IconAudio className="text-grafito" width={20} height={20} />
            </span>
          </>
        )}
        {charla.estado === 'derivada' ? (
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onResponder();
              }
            }}
            disabled={enviando}
            placeholder="Escribí tu respuesta — sale marcada «mostrador»"
            aria-label="Respuesta del equipo"
            className={`min-w-0 flex-1 border border-borde bg-lino outline-none focus:border-cobre disabled:bg-hueso disabled:text-[#8A8578] ${compacto ? 'rounded-pill px-3.5 py-2.5 text-[14px] md:text-[13.5px]' : 'rounded-otto px-3.5 py-2.5 text-sm'}`}
          />
        ) : (
          <div
            className={`min-w-0 flex-1 truncate text-[#8A8D94] ${compacto ? 'rounded-pill px-3.5 py-2.5 text-[14px] md:text-[13.5px]' : 'rounded-otto px-3.5 py-2.5 text-sm'}`}
            style={{ background: '#F3F0EA', border: '1px solid #E6E1D8' }}
          >
            {charla.estado === 'cerrada' ? 'Esta charla está cerrada.' : 'Tomá la charla para responder.'}
          </div>
        )}
        {compacto ? (
          <button
            type="button"
            onClick={onResponder}
            disabled={charla.estado !== 'derivada' || !texto.trim() || enviando}
            aria-label="Enviar"
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-pill bg-cobre text-base text-lino disabled:bg-[#EFEBE3] disabled:text-[#8A8D94]"
          >
            ↑
          </button>
        ) : (
          <button
            type="button"
            onClick={onResponder}
            disabled={charla.estado !== 'derivada' || !texto.trim() || enviando}
            className="flex-none rounded-otto bg-cobre px-4 py-2.5 text-[14px] font-medium text-lino disabled:bg-cobre/50 md:text-[13.5px]"
          >
            Enviar
          </button>
        )}
      </div>
    </div>
  );
}
