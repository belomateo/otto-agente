'use client';

// Turnos — vista día, conectada a GET /api/turnos?fecha=AAAA-MM-DD (H1.8, paneles). Grilla por
// probador en escritorio (80 px por hora, geometría del diseño), lista + hoja en celular. Lo
// que queda fuera de una franja de turnos se ve gris, «SIN TURNOS» (franjas reales del día,
// que la API ya trae calculadas). El aviso de sincronización con Calendar va además del estado
// real del turno, nunca en su lugar (decisión #2, 12/9). Puerto de d-turnos.html / m-turnos.html.
//
// «Nuevo turno», «Mover», «Cancelar» y «Marcar alquiló» todavía no tienen ruta en paneles
// (solo existen GET /api/turnos y el OK del cartel, H1.16): quedan deshabilitados con una nota,
// en vez de simular una acción que no pasa a ninguna base.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BloqueTurno, BORDE_ESTADO, type EstadoTurno } from '@/components/ui-otto/BloqueTurno';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { useDatos } from '@/components/api/useDatos';
import type { AgendaDelDia, FilaTurno } from '@/lib/queries/turnos';
import { aHora, aMinutos, describirFranjas, horaCorta } from '../configuracion/agenda/franjas';

type Franja = AgendaDelDia['franjas'][number];

const VACIO = { titulo: 'No hay turnos este día', texto: 'Cuando Lucía o el equipo agenden uno, aparece en su probador.' };
const SIN_FRANJAS = { titulo: 'Este día no se dan turnos', texto: 'Las franjas de turnos se cambian en Configuración › Agenda.' };
const SIN_CONECTAR = 'Todavía no conectado';

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

const inicioMin = (t: FilaTurno) => aMinutos(t.h) ?? INICIO;
const finMin = (t: FilaTurno) => inicioMin(t) + t.duracion_min;
const duracionCorta = (minutos: number) => (minutos < 60 ? `${minutos}’` : aHora(minutos));

/** 'AAAA-MM-DD' → el día siguiente o anterior, como fecha calendario (sin huso: se compara
 * contra lo que ya devolvió la API, no se calcula "hoy" del lado del cliente). */
function sumarDiaISO(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

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
function Flechas({ fecha, children }: { fecha: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link href={`/turnos?dia=${sumarDiaISO(fecha, -1)}`} aria-label="Día anterior" className="flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8">
        ‹
      </Link>
      {children}
      <Link href={`/turnos?dia=${sumarDiaISO(fecha, 1)}`} aria-label="Día siguiente" className="flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8">
        ›
      </Link>
    </span>
  );
}

function AccionesTurno({ compacto = false }: { compacto?: boolean }) {
  const boton = compacto
    ? 'flex-1 rounded-otto border border-borde bg-lino py-2 text-[14px] font-medium text-[#8A8578] md:text-[13px]'
    : 'flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium text-[#8A8578]';
  return (
    <>
      <div className="flex gap-2">
        <button type="button" disabled className={boton} title={SIN_CONECTAR}>
          Mover
        </button>
        <button type="button" disabled className={boton} title={SIN_CONECTAR}>
          Cancelar
        </button>
        <button type="button" disabled className={boton}>
          Marcar alquiló
        </button>
      </div>
      <div className="mt-1 text-center text-[14px] text-[#8A8578] md:text-xs">{SIN_CONECTAR}: paneles todavía no tiene la ruta para mover, cancelar o cambiar el estado.</div>
    </>
  );
}

function Popover({ turno, onCerrar }: { turno: FilaTurno; onCerrar: () => void }) {
  const actual = PASOS.findIndex((p) => p.estado === turno.estado);
  return (
    <div
      className="absolute z-10 w-[300px] rounded-otto border border-borde bg-lino p-4 shadow-otto-pop"
      style={{ left: `calc(56px + (100% - 56px) * ${(turno.probador - 1) / 3} + 34px)`, top: y(inicioMin(turno)) + 72 }}
    >
      <div className="flex items-baseline gap-2">
        <span className="flex-1 font-serif text-lg font-semibold">{turno.n}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-lg leading-none text-grafito">
          ×
        </button>
      </div>
      <div className="mt-0.5 text-[14px] leading-[1.5] text-grafito md:text-[13px]">
        {turno.t}
        <br />
        {turno.h} · {turno.p}
      </div>
      <div className="my-3.5 flex flex-wrap items-center gap-1 text-[14px] font-medium md:text-[11.5px]">
        {PASOS.map((paso, i) => (
          <span key={paso.estado} className="contents">
            {i > 0 && <span className="text-[#C9C4B9]">→</span>}
            <span className={i === actual ? 'rounded-pill bg-salvia-suave px-2.5 py-1 text-salvia' : 'rounded-pill border border-dashed border-[#D8D2C6] px-2.5 py-1 text-grafito'}>{paso.label}</span>
          </span>
        ))}
      </div>
      {turno.aviso && <div className="mb-2.5 text-[14px] font-medium text-ambar md:text-[13px]">↻ {turno.aviso}</div>}
      <button type="button" disabled title={SIN_CONECTAR} className="mb-2 w-full rounded-otto border border-cobre bg-lino py-2.5 text-[14px] font-medium text-cobre/60 md:text-[13px]">
        Abrir la charla de WhatsApp
      </button>
      <AccionesTurno />
    </div>
  );
}

function Grilla({ agenda, abiertoId, onAbrir }: { agenda: AgendaDelDia; abiertoId: string | null; onAbrir: (id: string | null) => void }) {
  const probadores = Array.from({ length: agenda.probadores ?? 1 }, (_, i) => i + 1);
  // El rótulo «SIN TURNOS» va una sola vez por tramo: en el primer probador que lo tiene.
  const rotulados = new Set<string>();
  const abierto = agenda.turnos.find((t) => t.id === abiertoId);

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
              {tramosSinTurnos(agenda.franjas, p).map((t) => {
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
              {agenda.turnos
                .filter((t) => t.probador === p)
                .map((t) =>
                  t.duracion_min >= 30 ? (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onAbrir(abiertoId === t.id ? null : t.id)}
                      className="absolute inset-x-1.5 text-left"
                      style={{ top: y(inicioMin(t)) }}
                    >
                      <BloqueTurno nombre={t.n} detalle={`${t.t} · ${t.e}`} estado={t.estado as EstadoTurno} aviso={t.aviso ?? undefined} />
                    </button>
                  ) : (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onAbrir(abiertoId === t.id ? null : t.id)}
                      className="absolute inset-x-1.5 flex items-center gap-2 overflow-hidden rounded-bloque border border-borde bg-lino px-2.5 text-left"
                      style={{
                        top: y(inicioMin(t)),
                        height: Math.max(22, y(finMin(t)) - y(inicioMin(t))),
                        borderLeft: `3px solid ${BORDE_ESTADO[t.estado as EstadoTurno]}`,
                      }}
                    >
                      <span className="font-serif text-[14px] font-semibold md:text-[12.5px]">{t.n}</span>
                      <span className="text-[14px] text-grafito md:text-[11px]">{t.t}</span>
                    </button>
                  ),
                )}
            </div>
          ))}
        </div>

        {abierto && <Popover turno={abierto} onCerrar={() => onAbrir(null)} />}
      </div>
    </>
  );
}

function HojaTurno({ turno, onCerrar }: { turno: FilaTurno; onCerrar: () => void }) {
  const estilo = { background: turno.eb, color: turno.ef };
  return (
    <div role="dialog" aria-label={`Turno de ${turno.n}`} className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="flex-1 bg-tinta/[.32]" onClick={onCerrar} />
      <div className="rounded-t-2xl bg-lino px-[18px] pb-[30px] pt-5 shadow-otto-pop">
        <div className="mx-auto mb-4 h-1 w-9 rounded-pill bg-borde" />
        <div className="flex items-baseline gap-2.5">
          <span className="flex-1 font-serif text-xl font-semibold">{turno.n}</span>
          <span className="rounded-pill px-2.5 py-[3px] text-[14px] font-medium" style={estilo}>
            {turno.e}
          </span>
        </div>
        <div className="mt-1 text-[14px] leading-[1.5] text-grafito">
          {turno.t}
          <br />
          {turno.h} · {turno.p}
        </div>
        {turno.aviso && <div className="mt-1 text-[14px] font-medium text-ambar">↻ {turno.aviso}</div>}
        <div className="mt-4.5 flex flex-col gap-2">
          <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto border border-cobre bg-lino py-3 text-sm font-medium text-cobre/60">
            Abrir la charla
          </button>
          <AccionesTurno compacto />
        </div>
      </div>
    </div>
  );
}

export default function TurnosPage() {
  const fechaPedida = useSearchParams().get('dia');
  const { datos: agenda, cargando, error, recargar } = useDatos<AgendaDelDia>(`/api/turnos${fechaPedida ? `?fecha=${fechaPedida}` : ''}`);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  if (cargando && !agenda) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!agenda) return null;

  const resumen = agenda.franjas.length ? `Turnos ${describirFranjas(agenda.franjas)}` : 'Sin turnos';
  const vacio = agenda.franjas.length === 0 ? SIN_FRANJAS : agenda.turnos.length === 0 ? VACIO : null;
  const turnos = [...agenda.turnos].sort((a, b) => inicioMin(a) - inicioMin(b));
  const abierto = agenda.turnos.find((t) => t.id === abiertoId) ?? null;

  return (
    <>
      {/* Escritorio — grilla por probador, geometría 1:1 con el diseño */}
      <div className="hidden flex-1 flex-col px-6 pt-5.5 md:flex">
        <div className="mb-1.5 flex items-center gap-3.5">
          <h1 className="font-serif text-[22px] font-semibold">Turnos</h1>
          <Flechas fecha={agenda.fecha}>
            <div className="min-w-[180px] text-center text-sm text-grafito">{agenda.titulo}</div>
          </Flechas>
          <div className="flex overflow-hidden rounded-otto border border-borde text-[14px] font-medium md:text-[13px]">
            <span className="bg-cobre px-4 py-[7px] text-lino">Día</span>
            <span className="bg-lino px-4 py-[7px] text-grafito">Semana</span>
          </div>
          {!vacio && agenda.sin_confirmar_manana > 0 && (
            <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[14px] font-medium text-ambar md:text-[12.5px]">Sin confirmar para mañana · {agenda.sin_confirmar_manana}</span>
          )}
          <button type="button" onClick={recargar} className="text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
            ↻ Actualizar
          </button>
          <div className="flex-1" />
          <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto bg-cobre/50 px-4.5 py-2.5 text-sm font-medium text-lino">
            Nuevo turno
          </button>
        </div>
        <div className="mb-4 text-[14px] text-grafito md:text-[13px]">{resumen}</div>

        {vacio ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={vacio.titulo} texto={vacio.texto} />
          </div>
        ) : (
          <Grilla agenda={agenda} abiertoId={abiertoId} onAbrir={setAbiertoId} />
        )}
      </div>

      {/* Mobile — lista del día + hoja del turno tocado */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-3 pt-[18px]">
          <div className="flex items-center">
            <div className="flex-1 font-serif text-[22px] font-semibold">Turnos</div>
            <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto bg-cobre/50 px-3.5 py-2.5 text-[14px] font-medium text-lino">
              Nuevo turno
            </button>
          </div>
          <div className="mt-2.5">
            <Flechas fecha={agenda.fecha}>
              <div className="min-w-0 flex-1 text-center text-[15px] font-medium">{agenda.titulo}</div>
            </Flechas>
          </div>
          <div className="mt-2 text-[14px] leading-[1.45] text-grafito">{resumen}</div>
          {!vacio && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {agenda.sin_confirmar_manana > 0 && <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[14px] font-medium text-ambar">Sin confirmar mañana · {agenda.sin_confirmar_manana}</span>}
              <span className="rounded-pill border border-borde px-3 py-1.5 text-[14px] font-medium text-grafito">Semana</span>
              <button type="button" onClick={recargar} className="text-[14px] text-tinta underline-offset-2">
                ↻ Actualizar
              </button>
            </div>
          )}
        </div>

        {vacio ? (
          <div className="mx-4 rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={vacio.titulo} texto={vacio.texto} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4">
            {turnos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAbiertoId(t.id)}
                className="flex items-center gap-3 rounded-otto border border-borde bg-lino px-3.5 py-[13px] text-left"
                style={{ borderLeft: `3px solid ${BORDE_ESTADO[t.estado as EstadoTurno]}` }}
              >
                <span className="w-[46px] flex-none font-serif text-[15px] font-semibold tabular-nums">{t.h}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-[15px] font-semibold">{t.n}</div>
                  <div className="text-[14px] text-grafito">
                    {t.t} · {t.p}
                  </div>
                  {t.aviso && <div className="mt-0.5 text-[14px] font-medium text-ambar">↻ {t.aviso}</div>}
                </div>
                <span className="flex-none rounded-pill px-[9px] py-[3px] text-[14px] font-medium" style={{ background: t.eb, color: t.ef }}>
                  {t.e}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {abierto && (
        <div className="md:hidden">
          <HojaTurno turno={abierto} onCerrar={() => setAbiertoId(null)} />
        </div>
      )}
    </>
  );
}
