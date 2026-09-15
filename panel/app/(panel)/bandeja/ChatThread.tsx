'use client';

// Hilo de una charla — conectado a GET /api/bandeja/<id> (H1.8, paneles). Compartido por la
// vista de escritorio (al lado de la lista) y la de mobile (/bandeja/charla). La bitácora va
// plegada y se abre desde la «i» (Burbuja.tsx); el mini resumen se ve al costado sin abrir
// nada. «Tomar la charla» y responder desde acá no tienen ruta en paneles todavía.

import Link from 'next/link';
import { BurbujaCliente, BurbujaLucia } from '@/components/ui-otto/Burbuja';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { IconAudio, IconFoto } from '@/components/nav/icons';
import { useDatos } from '@/components/api/useDatos';
import type { Charla } from '@/lib/queries/bandeja';

const SIN_CONECTAR = 'Todavía no conectado';

function separador(fecha: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (fecha === hoy) return 'Hoy';
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
  const { datos: charla, cargando, error, recargar } = useDatos<Charla>(conversacionId ? `/api/bandeja/${conversacionId}` : null);

  if (!conversacionId) return <div className="flex-1 bg-hueso" />;
  if (cargando && !charla) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!charla) return null;

  const bitacora = bitacoraDe(charla);
  const resumen = resumenDe(charla);
  const ultimoSalienteId = [...charla.mensajes].reverse().find((m) => m.direccion === 'saliente')?.id;

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
            <div className="truncate text-[14px] text-grafito md:text-xs">{charla.cliente.resumen || charla.cliente.telefono}</div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1.5 text-[14px] text-grafito md:text-xs">
              <span className="inline-block h-[7px] w-[7px] rounded-pill bg-noche" />
              La charla la tiene {charla.quien}
              {charla.cliente.etiqueta && <span className="ml-2 rounded-pill border border-borde px-2 py-0.5 text-[14px] md:text-[11px]">{charla.cliente.etiqueta}</span>}
              <span title={SIN_CONECTAR} className="cursor-not-allowed rounded-pill border border-dashed border-[#C9C4B9] px-2 py-0.5 text-[14px] text-[#8A8578] md:text-[11px]">
                + Etiqueta
              </span>
            </div>
          )}
        </div>
        {!compacto ? (
          <>
            <Link href={`/clientes?id=${charla.cliente.id}`} className="flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium md:text-[13.5px]">
              Ver ficha
            </Link>
            <button type="button" disabled title={SIN_CONECTAR} className="flex-none rounded-otto bg-cobre/50 px-4 py-2 text-[14px] font-medium text-lino md:text-[13.5px]">
              Tomar la charla
            </button>
          </>
        ) : (
          <span className="flex-none rounded-pill bg-noche-suave px-2.5 py-[3px] text-[14px] font-medium text-noche md:text-[11.5px]">{charla.quien}</span>
        )}
      </div>

      {compacto && (
        <div className="flex gap-2 border-b border-borde bg-lino p-3.5 pt-0">
          <Link href={`/clientes?id=${charla.cliente.id}`} className="flex-1 rounded-otto border border-borde bg-lino py-2 text-center text-[14px] font-medium md:text-[13px]">
            Ver ficha
          </Link>
          <button type="button" disabled title={SIN_CONECTAR} className="flex-1 rounded-otto bg-cobre/50 py-2 text-[14px] font-medium text-lino md:text-[13px]">
            Tomar la charla
          </button>
        </div>
      )}

      <div className={`flex flex-1 flex-col gap-3.5 overflow-y-auto ${compacto ? 'p-4' : 'px-7 py-5.5'}`}>
        {charla.mensajes.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay mensajes" texto="Cuando el cliente escriba, los mensajes aparecen acá." />
        ) : (
          charla.mensajes.map((m) => {
            const nuevoDia = m.fecha !== fechaAnterior;
            fechaAnterior = m.fecha;
            const esUltimoSaliente = m.id === ultimoSalienteId;
            return (
              <div key={m.id} className="contents">
                {!compacto && nuevoDia && <span className="self-center rounded-pill bg-[#EFEBE3] px-3 py-[3px] text-[14px] text-grafito md:text-xs">{separador(m.fecha)}</span>}
                {m.direccion === 'entrante' ? (
                  <BurbujaCliente texto={m.texto} hora={m.hora} />
                ) : (
                  <BurbujaLucia texto={m.texto} hora={m.hora} resumen={esUltimoSaliente ? resumen : undefined} bitacora={esUltimoSaliente ? bitacora : undefined} />
                )}
              </div>
            );
          })
        )}
      </div>

      <div className={`flex items-center gap-2.5 border-t border-borde bg-lino ${compacto ? 'px-3.5 pb-[22px] pt-2.5' : 'px-6 py-3.5'}`}>
        {!compacto ? (
          <>
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde opacity-45">
              <IconFoto className="text-grafito" />
            </span>
            <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-otto border border-borde opacity-45">
              <IconAudio className="text-grafito" />
            </span>
          </>
        ) : (
          <>
            <span className="flex-none opacity-50">
              <IconFoto className="text-grafito" width={20} height={20} />
            </span>
            <span className="flex-none opacity-50">
              <IconAudio className="text-grafito" width={20} height={20} />
            </span>
          </>
        )}
        <div
          className={`min-w-0 flex-1 truncate text-[#8A8D94] ${compacto ? 'rounded-pill px-3.5 py-2.5 text-[14px] md:text-[13.5px]' : 'rounded-otto px-3.5 py-2.5 text-sm'}`}
          style={{ background: '#F3F0EA', border: '1px solid #E6E1D8' }}
        >
          {SIN_CONECTAR}: paneles todavía no tiene la ruta para responder desde el panel.
        </div>
        {compacto ? (
          <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-pill bg-[#EFEBE3] text-base text-[#8A8D94]">↑</span>
        ) : (
          <button type="button" disabled title={SIN_CONECTAR} className="flex-none rounded-otto border border-borde bg-lino px-4 py-2.5 text-[14px] font-medium text-cobre/50 md:text-[13.5px]">
            Tomar la charla
          </button>
        )}
      </div>
    </div>
  );
}
