// Turnos — vista día con la agenda por franjas (decisión #7, 14/9): de lunes a
// viernes hay turnos desde las 13, el sábado a la tarde solo en los probadores 1 y 2
// y el domingo no hay. Lo que queda fuera de una franja se ve gris, «SIN TURNOS». Las
// flechas recorren los días del mock (?dia=AAAA-MM-DD). Puerto de d-turnos.html
// (grilla por probador, 80 px por hora como el diseño) y m-turnos.html +
// m-turno-abierto.html (lista + hoja inferior). El aviso de sincronización con
// Calendar va además del estado real del turno, nunca en su lugar (decisión #2).

import Link from 'next/link';
import { BloqueTurno, BORDE_ESTADO, ETIQUETA_ESTADO, type EstadoTurno } from '@/components/ui-otto/BloqueTurno';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { AGENDA, type Franja } from '../configuracion/agenda/agenda-mock';
import { aHora, aMinutos, describirFranjas, horaCorta } from '../configuracion/agenda/franjas';
import { pideVacio, type BusquedaPagina } from '../vacio';
import { DIA_INICIAL, DIAS_TURNOS, type DiaTurnos, type TurnoMock } from './turnos-mock';

const VACIO = { titulo: 'No hay turnos este día', texto: 'Cuando Lucía o el equipo agenden uno, aparece en su probador.' };
const SIN_FRANJAS = { titulo: 'Este día no se dan turnos', texto: 'Las franjas de turnos se cambian en Configuración › Agenda.' };

// Geometría del diseño: 80 px por hora desde las 9:30, la apertura más temprana.
const INICIO = 9 * 60 + 30;
const FIN = 19 * 60;
const y = (minutos: number) => Math.round(((minutos - INICIO) * 80) / 60);
const ALTO = y(FIN);
const HORAS = [INICIO, ...Array.from({ length: 10 }, (_, i) => (10 + i) * 60)];

const PASOS: { estado: EstadoTurno; label: string }[] = [
  { estado: 'confirmado', label: 'Confirmado' },
  { estado: 'alquilo', label: 'Alquiló' },
  { estado: 'retiro', label: 'Retiró' },
  { estado: 'devolvio', label: 'Devolvió' },
];

const CHIP_ESTADO: Record<EstadoTurno, { bg: string; fg: string }> = {
  'sin-confirmar': { bg: '#F7EFDD', fg: '#B8862B' },
  confirmado: { bg: '#E7EFE7', fg: '#5E7F62' },
  alquilo: { bg: '#F1E6D9', fg: '#A8703F' },
  retiro: { bg: '#EEF1F5', fg: '#1F2A3C' },
  devolvio: { bg: '#EFEDE8', fg: '#5C6068' },
  cancelado: { bg: '#EFEDE8', fg: '#5C6068' },
  'no-vino': { bg: '#EFEDE8', fg: '#5C6068' },
};

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const FLECHA = 'flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8';

const inicio = (t: TurnoMock) => aMinutos(t.desde) ?? INICIO;
const duracion = (minutos: number) => (minutos < 60 ? `${minutos}’` : aHora(minutos));

// Tramos de un probador fuera de toda franja: en una franja con P probadores toman
// turnos del 1 al P (supuesto #22), así que el sábado a la tarde el 3 queda gris.
function tramosSinTurnos(franjas: Franja[], probador: number) {
  const abiertas = franjas
    .filter((f) => f.probadores >= probador)
    .map((f) => [aMinutos(f.desde) ?? INICIO, aMinutos(f.hasta) ?? INICIO] as const)
    .sort((a, b) => a[0] - b[0]);
  const tramos: { desde: number; hasta: number }[] = [];
  let cursor = INICIO;
  for (const [desde, hasta] of abiertas) {
    if (desde > cursor) tramos.push({ desde: cursor, hasta: Math.min(desde, FIN) });
    cursor = Math.max(cursor, hasta);
  }
  if (cursor < FIN) tramos.push({ desde: cursor, hasta: FIN });
  return tramos;
}

// ‹ fecha ›: la fecha va entre las dos flechas.
function Flechas({ indice, vacia, children }: { indice: number; vacia: boolean; children: React.ReactNode }) {
  const destino = (i: number) => {
    const d = DIAS_TURNOS[i];
    return d ? `/turnos?dia=${d.fecha}${vacia ? '&vacio=1' : ''}` : null;
  };
  const anterior = destino(indice - 1);
  const siguiente = destino(indice + 1);
  return (
    <span className="flex min-w-0 items-center gap-2">
      {anterior ? (
        <Link href={anterior} aria-label="Día anterior" className={FLECHA}>
          ‹
        </Link>
      ) : (
        <span aria-hidden className={`${FLECHA} opacity-40`}>
          ‹
        </span>
      )}
      {children}
      {siguiente ? (
        <Link href={siguiente} aria-label="Día siguiente" className={FLECHA}>
          ›
        </Link>
      ) : (
        <span aria-hidden className={`${FLECHA} opacity-40`}>
          ›
        </span>
      )}
    </span>
  );
}

function Popover({ turno, diaSemana }: { turno: TurnoMock; diaSemana: number }) {
  const actual = PASOS.findIndex((p) => p.estado === turno.estado);
  return (
    <div
      className="absolute z-10 w-[300px] rounded-otto border border-borde bg-lino p-4 shadow-otto-pop"
      style={{ left: `calc(56px + (100% - 56px) * ${(turno.probador - 1) / 3} + 34px)`, top: y(inicio(turno)) + 72 }}
    >
      <div className="font-serif text-lg font-semibold">{turno.nombre}</div>
      <div className="mt-0.5 text-[14px] leading-[1.5] text-grafito md:text-[13px]">
        {turno.tipo}
        {turno.ficha && ` · ${turno.ficha.evento}`}
        <br />
        {turno.ficha && `${turno.ficha.telefono} · `}
        {DIA_CORTO[diaSemana]} {turno.desde} · Probador {turno.probador}
      </div>
      <div className="my-3.5 flex flex-wrap items-center gap-1 text-[14px] font-medium md:text-[11.5px]">
        {PASOS.map((paso, i) => (
          <span key={paso.estado} className="contents">
            {i > 0 && <span className="text-[#C9C4B9]">→</span>}
            <span
              className={
                i === actual
                  ? 'rounded-pill bg-salvia-suave px-2.5 py-1 text-salvia'
                  : 'rounded-pill border border-dashed border-[#D8D2C6] px-2.5 py-1 text-grafito'
              }
            >
              {paso.label}
            </span>
          </span>
        ))}
      </div>
      <button type="button" className="mb-2 w-full rounded-otto border border-cobre bg-lino py-2.5 text-[14px] font-medium text-cobre md:text-[13px]">
        Abrir la charla de WhatsApp
      </button>
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-otto border border-borde bg-lino py-2 text-[14px] font-medium md:text-[13px]">
          Mover
        </button>
        <button type="button" className="flex-1 rounded-otto border border-borde bg-lino py-2 text-[14px] font-medium text-ladrillo md:text-[13px]">
          Cancelar
        </button>
        <button type="button" className="flex-1 rounded-otto bg-cobre py-2 text-[14px] font-medium text-lino md:text-[13px]">
          Marcar alquiló
        </button>
      </div>
    </div>
  );
}

function Grilla({ dia, franjas }: { dia: DiaTurnos; franjas: Franja[] }) {
  const probadores = Array.from({ length: AGENDA.probadores }, (_, i) => i + 1);
  // El rótulo «SIN TURNOS» va una sola vez por tramo: en el primer probador que lo tiene.
  const rotulados = new Set<string>();
  const abierto = dia.turnos.find((t) => t.nombre === dia.abierto);

  return (
    <>
      <div className="flex border-b border-borde pb-2 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-xs">
        <div className="w-14 flex-none" />
        {probadores.map((p) => (
          <div key={p} className="flex-1 text-center">
            Probador {p}
          </div>
        ))}
      </div>

      <div className="relative flex-1 overflow-hidden" style={{ minHeight: ALTO + 20 }}>
        <div className="absolute inset-0 flex">
          <div className="relative w-14 flex-none font-sans text-[14px] tabular-nums text-grafito md:text-[11px]">
            {HORAS.map((h) => (
              <span key={h} className="absolute" style={{ top: y(h) - 2 }}>
                {aHora(h)}
              </span>
            ))}
          </div>

          {probadores.map((p) => (
            <div key={p} className="relative flex-1 border-l border-[#EFEBE2]">
              {tramosSinTurnos(franjas, p).map((t) => {
                const clave = `${t.desde}-${t.hasta}`;
                const rotulo = !rotulados.has(clave) && y(t.hasta) - y(t.desde) >= 30;
                rotulados.add(clave);
                return (
                  <div
                    key={clave}
                    className="absolute inset-x-0 flex items-center justify-center bg-[#EFEBE3] text-[14px] font-medium tracking-[.05em] text-[#8A8578] md:text-[11px]"
                    style={{ top: y(t.desde), height: y(t.hasta) - y(t.desde) }}
                  >
                    {rotulo && `SIN TURNOS ${horaCorta(aHora(t.desde))}–${horaCorta(aHora(t.hasta))}`}
                  </div>
                );
              })}
              {dia.turnos
                .filter((t) => t.probador === p)
                .map((t) =>
                  t.minutos >= 30 ? (
                    <div key={t.nombre} className="absolute inset-x-1.5" style={{ top: y(inicio(t)) }}>
                      <BloqueTurno
                        nombre={t.nombre}
                        detalle={`${t.tipo} · ${duracion(t.minutos)} · ${ETIQUETA_ESTADO[t.estado]}`}
                        estado={t.estado}
                        aviso={t.aviso}
                      />
                    </div>
                  ) : (
                    <div
                      key={t.nombre}
                      className="absolute inset-x-1.5 flex items-center gap-2 overflow-hidden rounded-bloque border border-borde bg-lino px-2.5"
                      style={{
                        top: y(inicio(t)),
                        height: Math.max(22, y(inicio(t) + t.minutos) - y(inicio(t))),
                        borderLeft: `3px solid ${BORDE_ESTADO[t.estado]}`,
                      }}
                    >
                      <span className="font-serif text-[14px] font-semibold md:text-[12.5px]">{t.nombre}</span>
                      <span className="text-[14px] text-grafito md:text-[11px]">
                        {t.tipo} · {duracion(t.minutos)}
                      </span>
                    </div>
                  ),
                )}
            </div>
          ))}
        </div>

        {/* Turno abierto — fijo como en el diseño */}
        {abierto && <Popover turno={abierto} diaSemana={dia.diaSemana} />}
      </div>
    </>
  );
}

export default async function TurnosPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);
  const { dia: pedido } = await searchParams;
  const indice = Math.max(0, DIAS_TURNOS.findIndex((d) => d.fecha === (typeof pedido === 'string' ? pedido : DIA_INICIAL)));
  const dia = DIAS_TURNOS[indice];
  const franjas = AGENDA.dias.find((d) => d.diaSemana === dia.diaSemana)?.franjas ?? [];
  const resumen = franjas.length ? `Turnos ${describirFranjas(franjas)}` : 'Sin turnos';
  const vacio = franjas.length === 0 ? SIN_FRANJAS : vacia ? VACIO : null;
  const turnos = [...dia.turnos].sort((a, b) => inicio(a) - inicio(b));
  const abierto = dia.turnos.find((t) => t.nombre === dia.abierto);
  const chip = !vacio && dia.sinConfirmarManana;

  return (
    <>
      {/* Escritorio — grilla por probador, geometría 1:1 con el diseño */}
      <div className="hidden flex-1 flex-col px-6 pt-5.5 md:flex">
        <div className="mb-1.5 flex items-center gap-3.5">
          <h1 className="font-serif text-[22px] font-semibold">Turnos</h1>
          <Flechas indice={indice} vacia={vacia}>
            <div className="min-w-[180px] text-center text-sm text-grafito">{dia.titulo}</div>
          </Flechas>
          <div className="flex overflow-hidden rounded-otto border border-borde text-[14px] font-medium md:text-[13px]">
            <span className="bg-cobre px-4 py-[7px] text-lino">Día</span>
            <span className="bg-lino px-4 py-[7px] text-grafito">Semana</span>
          </div>
          {chip && (
            <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[14px] font-medium text-ambar md:text-[12.5px]">
              Sin confirmar para mañana · {chip}
            </span>
          )}
          <div className="flex-1" />
          <button type="button" className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">
            Nuevo turno
          </button>
        </div>
        <div className="mb-4 text-[14px] text-grafito md:text-[13px]">{resumen}</div>

        {vacio ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={vacio.titulo} texto={vacio.texto} />
          </div>
        ) : (
          <Grilla dia={dia} franjas={franjas} />
        )}
      </div>

      {/* Mobile — lista del día + hoja del turno abierto */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-3 pt-[18px]">
          <div className="flex items-center">
            <div className="flex-1 font-serif text-[22px] font-semibold">Turnos</div>
            <button type="button" className="rounded-otto bg-cobre px-3.5 py-2.5 text-[14px] font-medium text-lino">
              Nuevo turno
            </button>
          </div>
          <div className="mt-2.5">
            <Flechas indice={indice} vacia={vacia}>
              <div className="min-w-0 flex-1 text-center text-[15px] font-medium">{dia.titulo}</div>
            </Flechas>
          </div>
          <div className="mt-2 text-[14px] leading-[1.45] text-grafito">{resumen}</div>
          {!vacio && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {chip && (
                <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[14px] font-medium text-ambar">
                  Sin confirmar mañana · {chip}
                </span>
              )}
              <span className="rounded-pill border border-borde px-3 py-1.5 text-[14px] font-medium text-grafito">Semana</span>
            </div>
          )}
        </div>

        {vacio ? (
          <div className="mx-4 rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={vacio.titulo} texto={vacio.texto} />
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4">
              {turnos.map((t) => (
                <div
                  key={t.nombre}
                  className="flex items-center gap-3 rounded-otto border border-borde bg-lino px-3.5 py-[13px]"
                  style={{ borderLeft: `3px solid ${BORDE_ESTADO[t.estado]}` }}
                >
                  <span className="w-[46px] flex-none font-serif text-[15px] font-semibold tabular-nums">{t.desde}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-serif text-[15px] font-semibold">{t.nombre}</div>
                    <div className="text-[14px] text-grafito">
                      {t.tipo} · {duracion(t.minutos)} · Probador{'\u00a0'}{t.probador}
                    </div>
                    {t.aviso && <div className="mt-0.5 text-[14px] font-medium text-ambar">↻ {t.aviso}</div>}
                  </div>
                  <span
                    className="flex-none rounded-pill px-[9px] py-[3px] text-[14px] font-medium"
                    style={{ background: CHIP_ESTADO[t.estado].bg, color: CHIP_ESTADO[t.estado].fg }}
                  >
                    {ETIQUETA_ESTADO[t.estado]}
                  </span>
                </div>
              ))}
            </div>

            {/* Hoja del turno abierto, siempre visible acá para mostrar el patrón "marcar con una mano" */}
            {abierto && (
              <div className="rounded-t-2xl bg-lino px-[18px] pb-[30px] pt-5 shadow-otto-pop">
                <div className="mx-auto mb-4 h-1 w-9 rounded-pill bg-borde" />
                <div className="flex items-baseline gap-2.5">
                  <span className="flex-1 font-serif text-xl font-semibold">{abierto.nombre}</span>
                  <span
                    className="rounded-pill px-2.5 py-[3px] text-[14px] font-medium"
                    style={{ background: CHIP_ESTADO[abierto.estado].bg, color: CHIP_ESTADO[abierto.estado].fg }}
                  >
                    {ETIQUETA_ESTADO[abierto.estado]}
                  </span>
                </div>
                <div className="mt-1 text-[14px] leading-[1.5] text-grafito">
                  {abierto.tipo}
                  {abierto.ficha && ` · ${abierto.ficha.evento}`}
                  <br />
                  {DIA_CORTO[dia.diaSemana]} {abierto.desde} · {duracion(abierto.minutos)} · Probador {abierto.probador}
                  {abierto.ficha && ` · ${abierto.ficha.telefono}`}
                </div>
                <div className="mt-4.5 flex flex-col gap-2">
                  <button type="button" className="rounded-otto bg-cobre py-3 text-[15px] font-medium text-lino">
                    Marcar alquiló
                  </button>
                  <button type="button" className="rounded-otto border border-cobre bg-lino py-3 text-sm font-medium text-cobre">
                    Abrir la charla
                  </button>
                  <div className="flex gap-2">
                    <button type="button" className="flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium">
                      Mover
                    </button>
                    <button type="button" className="flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium text-ladrillo">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
