'use client';

// Cartel de turno 30 min antes (H1.17, decisión #10 del 15/9). Vive en
// panel/app/(panel)/layout.tsx: se ve en cualquier pestaña, en escritorio y en celular.
// Datos reales de GET /api/turnos/avisos (H1.16, paneles) — ver useTurnosPorAvisar.ts.
//
// En escritorio hay lugar de sobra: una tarjeta completa por turno, apiladas arriba a la
// derecha, con toda la información a la vista.
//
// En celular, tarjetas completas (con los 8 y pico campos) tapan buena parte de la pantalla,
// y varias páginas ponen controles usables cerca del borde superior (las flechas de Turnos,
// a 69–109 px del borde, medido) o cerca del inferior (la hoja del turno abierto, también en
// Turnos): no hay un borde "seguro" para anclar algo alto sin volver inusable el resto del
// panel, que es justo lo que la decisión #10 pide evitar. Por eso en celular el cartel es
// siempre UNA fila (nunca crece con la cantidad de turnos): con uno solo, nombre + cuánto
// falta + OK; con dos o más, "N turnos" + el más próximo, y tocarla abre una hoja con la
// lista (cada fila con su propio OK). Tocar cualquier fila (fuera del OK) abre el detalle
// completo en otra hoja — mismo patrón (fondo + panel) que ya usa MasSheet para "Más": así el
// detalle sí tapa todo mientras está abierto, pero nada lo hace mientras no se pidió.
//
// No es un modal permanente ni en escritorio ni en celular (Supuestos): el equipo tiene que
// poder seguir usando el resto del panel — abrir la charla o la ficha del propio turno que
// señala el cartel, entre otras cosas — sin cerrarlo primero.

import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { useTurnosPorAvisar } from './useTurnosPorAvisar';
import type { AvisoTurno } from './tipos';

const CAMPO = 'text-[14px] leading-[1.4] text-grafito md:text-[13px]';
const ETIQUETA = 'text-[14px] font-medium text-tinta md:text-[13px]';

// «en 12 min» / «ya empezó», para que se note la urgencia sin tener que leer las dos horas.
// `inicio` es el ISO crudo (desde/hasta ya vienen formateadas en la hora del negocio, para
// mostrar; para la cuenta hace falta el instante real).
function faltan(inicio: string) {
  const minutos = Math.round((new Date(inicio).getTime() - Date.now()) / 60_000);
  if (minutos > 1) return `en ${minutos} min`;
  if (minutos >= -1) return 'ahora';
  return 'ya empezó';
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className={CAMPO}>
      <span className={ETIQUETA}>{etiqueta}:</span> {valor}
    </div>
  );
}

// El detalle completo: los mismos campos en la tarjeta de escritorio y en la hoja de celular.
function Detalle({ turno }: { turno: AvisoTurno }) {
  const evento = turno.cliente.evento ? `${turno.cliente.evento}${turno.cliente.fecha_evento_corta ? ` · ${turno.cliente.fecha_evento_corta}` : ''}` : null;
  return (
    <>
      <div className={`mt-0.5 ${CAMPO}`}>
        {turno.desde}–{turno.hasta} · {turno.t} · {turno.p}
      </div>
      <div className="my-2.5 flex flex-wrap items-center gap-1.5">
        <Chip estado={turno.cliente_confirmo ? 'Confirmado' : 'Sin confirmar'}>{turno.cliente_confirmo ? 'Confirmó por WhatsApp' : 'No confirmó todavía'}</Chip>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Dato etiqueta="Teléfono" valor={turno.cliente.telefono_legible} />
        <Dato etiqueta="Mail" valor={turno.cliente.email} />
        <Dato etiqueta="Evento" valor={evento} />
        <Dato etiqueta="Rol" valor={turno.cliente.rol} />
        <Dato etiqueta="Talle" valor={turno.cliente.talle_aprox} />
        <Dato etiqueta="Color" valor={turno.cliente.color_preferido} />
      </div>
      {turno.cliente.notas && (
        <div className={`mt-1.5 ${CAMPO}`}>
          <span className={ETIQUETA}>Notas:</span> {turno.cliente.notas}
        </div>
      )}
    </>
  );
}

// Sin charla todavía (el cliente nunca escribió), «Ver charla» no tiene adónde ir.
function Enlaces({ turno }: { turno: AvisoTurno }) {
  return (
    <>
      {turno.enlaces.charla ? (
        <Link href={turno.enlaces.charla} className="flex-1 rounded-otto border border-borde bg-lino py-2 text-center text-[14px] font-medium text-grafito md:text-[13px]">
          Ver charla
        </Link>
      ) : (
        <span className="flex-1 rounded-otto border border-borde bg-lino py-2 text-center text-[14px] font-medium text-[#8A8578] md:text-[13px]">Sin charla</span>
      )}
      <Link href={turno.enlaces.ficha} className="flex-1 rounded-otto border border-borde bg-lino py-2 text-center text-[14px] font-medium text-grafito md:text-[13px]">
        Ver ficha
      </Link>
    </>
  );
}

// Escritorio: tarjeta completa, siempre a la vista.
function TarjetaEscritorio({ turno, onOk }: { turno: AvisoTurno; onOk: () => void }) {
  return (
    <div className="w-[380px] rounded-otto border border-cobre bg-lino p-4 shadow-otto-pop">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-serif text-lg font-semibold">{turno.cliente.nombre}</span>
        <span className="flex-none rounded-pill bg-cobre-claro px-2.5 py-[3px] text-[14px] font-medium text-cobre md:text-xs">{faltan(turno.inicio)}</span>
      </div>
      <Detalle turno={turno} />
      <div className="mt-3 flex gap-2">
        <Enlaces turno={turno} />
        <button type="button" onClick={onOk} className="flex-1 rounded-otto bg-cobre py-2 text-[14px] font-medium text-lino md:text-[13px]">
          OK
        </button>
      </div>
    </div>
  );
}

// Celular: una fila angosta por turno (se usa sola con un turno, o dentro de la lista con
// varios); tocarla fuera del OK abre el detalle en una hoja.
function FilaCelular({ turno, onAbrir, onOk }: { turno: AvisoTurno; onAbrir: () => void; onOk: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-otto border border-cobre bg-lino py-2 pl-3.5 pr-2 shadow-otto-pop">
      <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left">
        <span className="min-w-0 flex-1 truncate font-serif text-[15px] font-semibold">{turno.cliente.nombre}</span>
        <span className="flex-none rounded-pill bg-cobre-claro px-2 py-[2px] text-[14px] font-medium text-cobre">{faltan(turno.inicio)}</span>
      </button>
      <button
        type="button"
        onClick={onOk}
        aria-label={`OK, turno de ${turno.cliente.nombre}`}
        className="flex-none rounded-otto bg-cobre px-3 py-1.5 text-[14px] font-medium text-lino"
      >
        OK
      </button>
    </div>
  );
}

// Celular, con dos o más: la única fila fija dice cuántos hay y el más próximo; tocarla abre
// la lista. Así el cartel nunca crece con la cantidad de turnos (nunca tapa más que una fila).
function FilaResumen({ cantidad, proximo, onAbrir }: { cantidad: number; proximo: AvisoTurno; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir} className="flex w-full items-center gap-2 rounded-otto border border-cobre bg-lino py-2 pl-3.5 pr-3 text-left shadow-otto-pop">
      <span className="flex-none font-serif text-[15px] font-semibold">{cantidad} turnos</span>
      <span className="min-w-0 flex-1 truncate rounded-pill bg-cobre-claro px-2 py-[2px] text-[14px] font-medium text-cobre">
        {proximo.cliente.nombre} · {faltan(proximo.inicio)}
      </span>
    </button>
  );
}

// Hoja modal con la lista de turnos (solo cuando hay dos o más), en celular.
function HojaLista({ turnos, onCerrar, onAbrirDetalle, onOk }: { turnos: AvisoTurno[]; onCerrar: () => void; onAbrirDetalle: (id: string) => void; onOk: (id: string) => void }) {
  return (
    <div role="dialog" aria-label="Turnos por avisar" className="fixed inset-0 z-[65] flex flex-col justify-end">
      <div className="flex-1 bg-tinta/[.32]" onClick={onCerrar} />
      <div className="rounded-t-2xl bg-lino px-[18px] pb-[26px] pt-5">
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-pill bg-borde" />
        <div className="mb-2.5 font-serif text-lg font-semibold">Turnos por avisar</div>
        <div className="flex flex-col gap-2">
          {turnos.map((t) => (
            <FilaCelular key={t.id} turno={t} onAbrir={() => onAbrirDetalle(t.id)} onOk={() => onOk(t.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Hoja modal con el detalle completo de un turno, en celular — mismo patrón que MasSheet
// (fondo + panel), así mientras está abierta sí tapa el resto a propósito.
function HojaDetalle({ turno, onCerrar, onOk }: { turno: AvisoTurno; onCerrar: () => void; onOk: () => void }) {
  return (
    <div role="dialog" aria-label={`Turno de ${turno.cliente.nombre}`} className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="flex-1 bg-tinta/[.32]" onClick={onCerrar} />
      <div className="rounded-t-2xl bg-lino px-[18px] pb-[26px] pt-5">
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-pill bg-borde" />
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-serif text-lg font-semibold">{turno.cliente.nombre}</span>
          <span className="flex-none rounded-pill bg-cobre-claro px-2.5 py-[3px] text-[14px] font-medium text-cobre">{faltan(turno.inicio)}</span>
        </div>
        <Detalle turno={turno} />
        <div className="mt-3.5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onOk();
              onCerrar();
            }}
            className="rounded-otto bg-cobre py-2.5 text-[15px] font-medium text-lino"
          >
            OK
          </button>
          <div className="flex gap-2">
            <Enlaces turno={turno} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CartelTurno() {
  const { turnos, marcarOk } = useTurnosPorAvisar();
  const [listaAbierta, setListaAbierta] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const detalle = turnos.find((t) => t.id === detalleId) ?? null;

  if (turnos.length === 0) return null;
  const ordenados = [...turnos].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  return (
    <>
      {/* Escritorio: una tarjeta completa por turno, siempre a la vista. */}
      <div role="region" aria-label="Turnos por avisar" className="pointer-events-none fixed right-7 top-5 z-[60] hidden flex-col gap-2.5 md:flex">
        {ordenados.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <TarjetaEscritorio turno={t} onOk={() => marcarOk(t.id)} />
          </div>
        ))}
      </div>

      {/* Celular: una sola fila siempre (nunca tapa más que eso), por debajo de la hoja
          "Más" (z-45 < z-50) para no robarle su fondo de cierre si las dos están abiertas. */}
      <div role="region" aria-label="Turnos por avisar" className="pointer-events-none fixed inset-x-3 top-3 z-[45] md:hidden">
        <div className="pointer-events-auto">
          {ordenados.length === 1 ? (
            <FilaCelular turno={ordenados[0]} onAbrir={() => setDetalleId(ordenados[0].id)} onOk={() => marcarOk(ordenados[0].id)} />
          ) : (
            <FilaResumen cantidad={ordenados.length} proximo={ordenados[0]} onAbrir={() => setListaAbierta(true)} />
          )}
        </div>
      </div>
      {listaAbierta && (
        <div className="md:hidden">
          <HojaLista turnos={ordenados} onCerrar={() => setListaAbierta(false)} onAbrirDetalle={setDetalleId} onOk={marcarOk} />
        </div>
      )}
      {detalle && (
        <div className="md:hidden">
          <HojaDetalle turno={detalle} onCerrar={() => setDetalleId(null)} onOk={() => marcarOk(detalle.id)} />
        </div>
      )}
    </>
  );
}
