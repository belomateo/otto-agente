'use client';

// Turnos — vista día, conectada a GET /api/turnos?fecha=AAAA-MM-DD (H1.8, paneles). Grilla por
// probador en escritorio (80 px por hora, geometría del diseño), lista + hoja en celular. Lo
// que queda fuera de una franja de turnos se ve gris, «SIN TURNOS» (franjas reales del día,
// que la API ya trae calculadas). El aviso de sincronización con Calendar va además del estado
// real del turno, nunca en su lugar (decisión #2, 12/9). Puerto de d-turnos.html / m-turnos.html.
//
// Los estados del turno (Marcar alquiló/retiró/devolvió, No vino, Cancelar) van contra
// PATCH /api/turnos/<id> (lib/edicion/entidades.ts, `turnos`): el servidor valida qué
// transición es posible desde el estado actual y exige un motivo para cancelar. «Mover» a otro
// horario todavía no tiene ruta en paneles: queda deshabilitado con una nota, en vez de simular
// una acción que no pasa a ninguna base. «Nuevo turno» sí (NuevoTurno.tsx, 22/9).
//
// Vista semana (?vista=semana&dia=AAAA-MM-DD, GET /api/turnos/semana?desde=, H1.8 paneles):
// no hay maqueta de Claude Design para esto (pedido de Mateo 18/9, sin mock previo) — es una
// lista de 7 secciones de día, no una grilla de 7 columnas: con dos o tres turnos superpuestos
// en un mismo horario, columnas angostas se vuelven ilegibles justo en los días más ocupados.
// Misma lista en escritorio y celular (a diferencia de la vista día, acá el layout no cambia
// con el ancho, así que no hace falta duplicar el contenido por breakpoint como el resto del
// archivo) — tocar un turno abre HojaTurno, el mismo modal que ya usa el día en celular: no
// hay geometría de grilla en la vista semana que le dé sentido a un Popover posicionado.
//
// Vista mensual (?vista=mes&mes=AAAA-MM, GET /api/turnos/mes, H1.8 paneles) — pedido explícito
// de Mateo, 22/9 ("importante que se haga"): un mapa de densidad para elegir a dónde ir, no un
// tercer layout de turnos completos — el propio endpoint solo trae un conteo por día a
// propósito. Un día tocado cae en la vista Día real. El selector Día/Semana/Mes pasa a tener
// tres estados (ToggleVistas en escritorio, un <select> en celular — con dos entraba una sola
// pastilla con "la otra vista", con tres ya no entra cómodo en la misma barra).

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BloqueTurno, BORDE_ESTADO, type EstadoTurno } from '@/components/ui-otto/BloqueTurno';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { useDatos } from '@/components/api/useDatos';
import { useEstadoTurno } from '@/components/api/useEstadoTurno';
import type { AgendaDelDia, FilaTurno } from '@/lib/queries/turnos';
import { aHora, aMinutos, describirFranjas, horaCorta } from '../configuracion/agenda/franjas';
import { NuevoTurnoModal } from './NuevoTurno';

type Franja = AgendaDelDia['franjas'][number];
// GET /api/turnos/semana?desde=AAAA-MM-DD (paneles): 7 días, cada uno con la misma forma que
// ya devuelve GET /api/turnos para un día.
type AgendaSemana = { semana: { desde: string; hasta: string }; dias: AgendaDelDia[] };
// GET /api/turnos/mes?desde=AAAA-MM (paneles): un conteo por día, no las fichas completas —
// alcanza para pintar la grilla sin traer 30 días de detalle (decisión de Mateo, 22/9,
// "importante que se haga").
type DiaMes = { fecha: string; total: number; sin_confirmar: number };
type AgendaMes = { mes: string; dias: DiaMes[] };
type Vista = 'dia' | 'semana' | 'mes';

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

/** 'AAAA-MM-DD' → '15', 'AAAA-MM-DD' → 'septiembre', para el rango de la semana. */
const diaDelMes = (fecha: string) => Number(fecha.slice(8, 10));
const nombreMes = (fecha: string) => new Date(`${fecha}T00:00:00Z`).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });

/** '15 – 21 de septiembre', o '29 de septiembre – 5 de octubre' si cruza de mes. */
function rangoSemana(desde: string, hasta: string): string {
  const mesDesde = nombreMes(desde);
  const mesHasta = nombreMes(hasta);
  return mesDesde === mesHasta ? `${diaDelMes(desde)} – ${diaDelMes(hasta)} de ${mesDesde}` : `${diaDelMes(desde)} de ${mesDesde} – ${diaDelMes(hasta)} de ${mesHasta}`;
}

/** 'AAAA-MM' ± n meses, como el mes calendario (sin huso: son solo año y mes, no un instante). */
function sumarMesISO(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'AAAA-MM' → 'Septiembre 2026'. */
function nombreMesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const nombre = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
}

/** La grilla de 6 semanas (42 días, lunes primero) que muestra el mes, con los días de los
 * meses vecinos que hacen falta para completarla — se ven pero sin datos (no vienen del
 * servidor, que solo trae el mes pedido) y igual llevan a la vista Día si se tocan. */
function grillaMes(mes: string, dias: DiaMes[]): { fecha: string; esDelMes: boolean; dato: DiaMes | null }[] {
  const [y, m] = mes.split('-').map(Number);
  const primerDia = new Date(Date.UTC(y, m - 1, 1));
  const diaSemanaISO = (primerDia.getUTCDay() + 6) % 7; // 0 = lunes
  const inicioGrilla = new Date(primerDia);
  inicioGrilla.setUTCDate(primerDia.getUTCDate() - diaSemanaISO);
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrilla);
    d.setUTCDate(inicioGrilla.getUTCDate() + i);
    const fecha = d.toISOString().slice(0, 10);
    return { fecha, esDelMes: d.getUTCMonth() === m - 1, dato: porFecha.get(fecha) ?? null };
  });
}

/** Adónde manda cada pestaña del selector Día/Semana/Mes desde donde sea que estemos ahora.
 * `ancla` es la fecha del día/semana actual, o el 'AAAA-MM' del mes actual. */
function hrefVista(vista: Vista, ancla: string): string {
  const dia = ancla.length === 7 ? `${ancla}-01` : ancla;
  if (vista === 'dia') return `/turnos?dia=${dia}`;
  if (vista === 'semana') return `/turnos?vista=semana&dia=${dia}`;
  return `/turnos?vista=mes&mes=${dia.slice(0, 7)}`;
}

const ETIQUETA_VISTA: Record<Vista, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes' };

// El selector de escritorio, de a tres — reemplaza el par de celdas fijas que había antes de
// sumar Mes.
function ToggleVistas({ vistaActual, ancla }: { vistaActual: Vista; ancla: string }) {
  return (
    <div className="flex overflow-hidden rounded-otto border border-borde text-[14px] font-medium md:text-[13px]">
      {(['dia', 'semana', 'mes'] as const).map((v) =>
        v === vistaActual ? (
          <span key={v} className="bg-cobre px-4 py-[7px] text-lino">
            {ETIQUETA_VISTA[v]}
          </span>
        ) : (
          <Link key={v} href={hrefVista(v, ancla)} className="bg-lino px-4 py-[7px] text-grafito">
            {ETIQUETA_VISTA[v]}
          </Link>
        ),
      )}
    </div>
  );
}

// En celular, un <select> en vez de tres pastillas: con dos entraba una al lado de la otra
// (la pestaña que faltaba, nomás), pero con tres ya no hay lugar cómodo en la barra que ya
// tiene la fecha y "Actualizar" (pedido de logica, 22/9, al sumar Mes).
function SelectorVistaMobile({ vistaActual, ancla }: { vistaActual: Vista; ancla: string }) {
  const router = useRouter();
  return (
    <select
      value={vistaActual}
      onChange={(e) => router.push(hrefVista(e.target.value as Vista, ancla))}
      aria-label="Vista de Turnos"
      className="rounded-pill border border-borde bg-lino px-3 py-1.5 text-[14px] font-medium text-grafito"
    >
      <option value="dia">Día</option>
      <option value="semana">Semana</option>
      <option value="mes">Mes</option>
    </select>
  );
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

// Igual que Flechas, pero de a 7 días: ‹ semana › en vez de ‹ día ›.
function FlechasSemana({ desde, children }: { desde: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link href={`/turnos?vista=semana&dia=${sumarDiaISO(desde, -7)}`} aria-label="Semana anterior" className="flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8">
        ‹
      </Link>
      {children}
      <Link href={`/turnos?vista=semana&dia=${sumarDiaISO(desde, 7)}`} aria-label="Semana siguiente" className="flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8">
        ›
      </Link>
    </span>
  );
}

// Igual que Flechas y FlechasSemana, pero de a un mes.
function FlechasMes({ mes, children }: { mes: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link href={`/turnos?vista=mes&mes=${sumarMesISO(mes, -1)}`} aria-label="Mes anterior" className="flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8">
        ‹
      </Link>
      {children}
      <Link href={`/turnos?vista=mes&mes=${sumarMesISO(mes, 1)}`} aria-label="Mes siguiente" className="flex h-10 w-10 flex-none items-center justify-center rounded-otto border border-borde bg-lino text-[18px] leading-none text-grafito md:h-8 md:w-8">
        ›
      </Link>
    </span>
  );
}

// Próximo estado posible desde el actual (lib/edicion/entidades.ts, `turnos`, espejo de las
// transiciones que valida el servidor). sin-confirmar y confirmado se tratan igual: las dos
// pueden pasar a alquiló, no vino o cancelado.
const SIGUIENTES: Record<string, { estado: string; label: string }[]> = {
  'sin-confirmar': [
    { estado: 'alquilo', label: 'Marcar alquiló' },
    { estado: 'no-vino', label: 'No vino' },
  ],
  confirmado: [
    { estado: 'alquilo', label: 'Marcar alquiló' },
    { estado: 'no-vino', label: 'No vino' },
  ],
  alquilo: [{ estado: 'retiro', label: 'Marcar retiró' }],
  retiro: [{ estado: 'devolvio', label: 'Marcar devolvió' }],
};
const PUEDE_CANCELAR = new Set(['sin-confirmar', 'confirmado', 'alquilo', 'retiro']);

function AccionesTurno({ turno, compacto = false, onCambio }: { turno: FilaTurno; compacto?: boolean; onCambio: () => void }) {
  const { enviando, error, cambiarEstado } = useEstadoTurno(turno, onCambio);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const boton = compacto
    ? 'flex-1 rounded-otto border border-borde bg-lino py-2 text-[14px] font-medium md:text-[13px] disabled:opacity-50'
    : 'flex-1 rounded-otto border border-borde bg-lino py-3 text-sm font-medium disabled:opacity-50';

  const siguientes = SIGUIENTES[turno.estado] ?? [];
  const puedeCancelar = PUEDE_CANCELAR.has(turno.estado);
  if (siguientes.length === 0 && !puedeCancelar) return null; // estado final: nada para hacer acá

  if (cancelando) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de la cancelación"
          disabled={enviando}
          className="w-full rounded-otto border border-borde bg-lino px-3 py-2.5 text-sm outline-none focus:border-cobre disabled:bg-hueso"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCancelando(false);
              setMotivo('');
            }}
            disabled={enviando}
            className={boton}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await cambiarEstado('cancelado', motivo.trim())) {
                setCancelando(false);
                setMotivo('');
              }
            }}
            disabled={enviando || !motivo.trim()}
            className="flex-1 rounded-otto bg-ladrillo py-3 text-sm font-medium text-lino disabled:opacity-50"
          >
            Confirmar cancelación
          </button>
        </div>
        {error && <div className="text-center text-[14px] text-ladrillo md:text-xs">{error}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled title={SIN_CONECTAR} className={`${boton} text-[#8A8578]`}>
          Mover
        </button>
        {siguientes.map((s) => (
          <button key={s.estado} type="button" onClick={() => cambiarEstado(s.estado)} disabled={enviando} className={boton}>
            {s.label}
          </button>
        ))}
        {puedeCancelar && (
          <button type="button" onClick={() => setCancelando(true)} disabled={enviando} className={boton}>
            Cancelar
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-center text-[14px] text-ladrillo md:text-xs">{error}</div>}
    </>
  );
}

function Popover({ turno, probadores, onCerrar, onCambio }: { turno: FilaTurno; probadores: number; onCerrar: () => void; onCambio: () => void }) {
  const actual = PASOS.findIndex((p) => p.estado === turno.estado);
  // min(...): con 4 columnas o más el cálculo por fracción puede empujar los 300 px del
  // popover fuera de la grilla en las últimas columnas — se sujeta al borde derecho.
  const izquierda = `min(calc(56px + (100% - 56px) * ${(turno.probador - 1) / probadores} + 34px), calc(100% - 308px))`;
  return (
    <div className="absolute z-10 w-[300px] rounded-otto border border-borde bg-lino p-4 shadow-otto-pop" style={{ left: izquierda, top: y(inicioMin(turno)) + 72 }}>
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
      <AccionesTurno turno={turno} onCambio={onCambio} />
    </div>
  );
}

function Grilla({
  agenda,
  abiertoId,
  onAbrir,
  onCambio,
}: {
  agenda: AgendaDelDia;
  abiertoId: string | null;
  onAbrir: (id: string | null) => void;
  onCambio: () => void;
}) {
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

        {abierto && <Popover turno={abierto} probadores={probadores.length} onCerrar={() => onAbrir(null)} onCambio={onCambio} />}
      </div>
    </>
  );
}

function HojaTurno({ turno, onCerrar, onCambio }: { turno: FilaTurno; onCerrar: () => void; onCambio: () => void }) {
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
          <AccionesTurno turno={turno} compacto onCambio={onCambio} />
        </div>
      </div>
    </div>
  );
}

// Una fila de la lista (día en celular, o cada sección de la semana). Extraído porque la
// vista semana la reusa tal cual.
function FilaTurnoLista({ t, onAbrir }: { t: FilaTurno; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
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
  );
}

// Una de las 7 secciones de la vista semana: el título del día (mismo formato que ya trae
// AgendaDelDia.titulo) y sus turnos, o un aviso corto si no hay franjas o no hay turnos.
function SeccionDia({ dia, onAbrir }: { dia: AgendaDelDia; onAbrir: (id: string) => void }) {
  const turnos = [...dia.turnos].sort((a, b) => inicioMin(a) - inicioMin(b));
  const vacio = dia.franjas.length === 0 ? 'Este día no se dan turnos' : turnos.length === 0 ? 'Sin turnos' : null;
  return (
    <div className="border-b border-borde-suave py-3.5 last:border-b-0">
      <div className="mb-2 font-serif text-[16px] font-semibold">{dia.titulo}</div>
      {vacio ? (
        <div className="text-[14px] text-grafito">{vacio}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {turnos.map((t) => (
            <FilaTurnoLista key={t.id} t={t} onAbrir={() => onAbrir(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// Vista semana: una sola lista para cualquier ancho (a diferencia del día, el layout no
// cambia con el breakpoint, así que no hace falta duplicar el contenido). Tocar un turno abre
// HojaTurno — no hay grilla acá que le dé sentido a un Popover posicionado por columna.
function VistaSemana({
  semana,
  abiertoId,
  onAbrir,
  onCambio,
  onNuevoTurno,
}: {
  semana: AgendaSemana;
  abiertoId: string | null;
  onAbrir: (id: string | null) => void;
  onCambio: () => void;
  onNuevoTurno: () => void;
}) {
  const abierto = semana.dias.flatMap((d) => d.turnos).find((t) => t.id === abiertoId) ?? null;
  const rango = rangoSemana(semana.semana.desde, semana.semana.hasta);

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 flex-col px-6 pt-5.5 md:flex">
        <div className="mb-1.5 flex items-center gap-3.5">
          <h1 className="font-serif text-[22px] font-semibold">Turnos</h1>
          <FlechasSemana desde={semana.semana.desde}>
            <div className="min-w-[220px] text-center text-sm text-grafito">{rango}</div>
          </FlechasSemana>
          <ToggleVistas vistaActual="semana" ancla={semana.semana.desde} />
          <button type="button" onClick={onCambio} className="text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
            ↻ Actualizar
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onNuevoTurno} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">
            Nuevo turno
          </button>
        </div>
      </div>

      {/* Celular */}
      <div className="px-4 pb-3 pt-[18px] md:hidden">
        <div className="flex items-center">
          <div className="flex-1 font-serif text-[22px] font-semibold">Turnos</div>
          <button type="button" onClick={onNuevoTurno} className="rounded-otto bg-cobre px-3.5 py-2.5 text-[14px] font-medium text-lino">
            Nuevo turno
          </button>
        </div>
        <div className="mt-2.5">
          <FlechasSemana desde={semana.semana.desde}>
            <div className="min-w-0 flex-1 text-center text-[15px] font-medium">{rango}</div>
          </FlechasSemana>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <SelectorVistaMobile vistaActual="semana" ancla={semana.semana.desde} />
          <button type="button" onClick={onCambio} className="text-[14px] text-tinta underline-offset-2">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Contenido: una sola lista, compartida por los dos anchos. */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 md:px-6">
        {semana.dias.map((dia) => (
          <SeccionDia key={dia.fecha} dia={dia} onAbrir={(id) => onAbrir(id)} />
        ))}
      </div>

      {abierto && <HojaTurno turno={abierto} onCerrar={() => onAbrir(null)} onCambio={onCambio} />}
    </>
  );
}

// Vista mensual (pedido explícito de Mateo, 22/9): un mapa de densidad para elegir a dónde ir,
// no la semana pero más ancha — GET /api/turnos/mes trae un conteo por día a propósito, sin el
// detalle de cada turno, para no arrastrarse con 30 días de fichas completas. Se toca un día y
// se cae en la vista Día, que ya tiene el detalle real. Misma grilla en escritorio y celular:
// un calendario de 7 columnas es la forma esperada en cualquier ancho, a diferencia de la
// semana (ahí sí hacía falta una lista en vez de columnas).
function VistaMes({ mes, onNuevoTurno, onCambio }: { mes: AgendaMes; onNuevoTurno: () => void; onCambio: () => void }) {
  const celdas = grillaMes(mes.mes, mes.dias);
  const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 flex-col px-6 pt-5.5 md:flex">
        <div className="mb-1.5 flex items-center gap-3.5">
          <h1 className="font-serif text-[22px] font-semibold">Turnos</h1>
          <FlechasMes mes={mes.mes}>
            <div className="min-w-[180px] text-center text-sm text-grafito">{nombreMesLargo(mes.mes)}</div>
          </FlechasMes>
          <ToggleVistas vistaActual="mes" ancla={mes.mes} />
          <button type="button" onClick={onCambio} className="text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
            ↻ Actualizar
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onNuevoTurno} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">
            Nuevo turno
          </button>
        </div>
      </div>

      {/* Celular */}
      <div className="px-4 pb-3 pt-[18px] md:hidden">
        <div className="flex items-center">
          <div className="flex-1 font-serif text-[22px] font-semibold">Turnos</div>
          <button type="button" onClick={onNuevoTurno} className="rounded-otto bg-cobre px-3.5 py-2.5 text-[14px] font-medium text-lino">
            Nuevo turno
          </button>
        </div>
        <div className="mt-2.5">
          <FlechasMes mes={mes.mes}>
            <div className="min-w-0 flex-1 text-center text-[15px] font-medium">{nombreMesLargo(mes.mes)}</div>
          </FlechasMes>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <SelectorVistaMobile vistaActual="mes" ancla={mes.mes} />
          <button type="button" onClick={onCambio} className="text-[14px] text-tinta underline-offset-2">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Grilla: compartida por los dos anchos. */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 md:px-6">
        <div className="grid grid-cols-7 gap-1 border-b border-borde pb-2 text-center text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-xs">
          {DIAS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 pt-1.5">
          {celdas.map((c) => (
            <Link
              key={c.fecha}
              href={`/turnos?dia=${c.fecha}`}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-otto border ${
                c.esDelMes ? 'border-borde bg-lino' : 'border-transparent text-[#C9C4B9]'
              }`}
            >
              <span className={`font-serif text-[14px] font-semibold md:text-[13px] ${c.esDelMes ? '' : 'text-[#C9C4B9]'}`}>{Number(c.fecha.slice(8, 10))}</span>
              {c.dato && c.dato.total > 0 && (
                <span className="flex items-center gap-1">
                  <span className="rounded-pill bg-cobre-claro px-[7px] py-px text-[14px] font-medium text-cobre md:text-[11px]">{c.dato.total}</span>
                  {c.dato.sin_confirmar > 0 && <span className="h-[6px] w-[6px] rounded-pill bg-ambar" title={`${c.dato.sin_confirmar} sin confirmar`} />}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

/** Para prellenar la fecha de "Nuevo turno" desde la vista Mes: hoy, si cae en el mes que se
 * está mirando; si no, el primero de ese mes (no tiene sentido ofrecer una fecha de otro mes). */
function fechaPorDefectoDesdeMes(mes: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return hoy.slice(0, 7) === mes ? hoy : `${mes}-01`;
}

export default function TurnosPage() {
  const params = useSearchParams();
  const fechaPedida = params.get('dia');
  const mesPedido = params.get('mes');
  const vistaParam = params.get('vista');
  const esSemana = vistaParam === 'semana';
  const esMes = vistaParam === 'mes';
  const { datos: agenda, cargando, error, recargar } = useDatos<AgendaDelDia>(esSemana || esMes ? null : `/api/turnos${fechaPedida ? `?fecha=${fechaPedida}` : ''}`);
  const { datos: semana, cargando: cargandoSemana, error: errorSemana, recargar: recargarSemana } = useDatos<AgendaSemana>(
    esSemana ? `/api/turnos/semana${fechaPedida ? `?desde=${fechaPedida}` : ''}` : null,
  );
  const { datos: mes, cargando: cargandoMes, error: errorMes, recargar: recargarMes } = useDatos<AgendaMes>(esMes ? `/api/turnos/mes${mesPedido ? `?desde=${mesPedido}` : ''}` : null);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [nuevoTurnoAbierto, setNuevoTurnoAbierto] = useState(false);

  if (esMes) {
    if (cargandoMes && !mes) return <Cargando />;
    if (errorMes) return <EstadoError mensaje={errorMes} onReintentar={recargarMes} />;
    if (!mes) return null;
    return (
      <>
        <VistaMes mes={mes} onCambio={recargarMes} onNuevoTurno={() => setNuevoTurnoAbierto(true)} />
        {nuevoTurnoAbierto && <NuevoTurnoModal fechaInicial={fechaPorDefectoDesdeMes(mes.mes)} onCerrar={() => setNuevoTurnoAbierto(false)} onCreado={recargarMes} />}
      </>
    );
  }

  if (esSemana) {
    if (cargandoSemana && !semana) return <Cargando />;
    if (errorSemana) return <EstadoError mensaje={errorSemana} onReintentar={recargarSemana} />;
    if (!semana) return null;
    return (
      <>
        <VistaSemana semana={semana} abiertoId={abiertoId} onAbrir={setAbiertoId} onCambio={recargarSemana} onNuevoTurno={() => setNuevoTurnoAbierto(true)} />
        {nuevoTurnoAbierto && <NuevoTurnoModal fechaInicial={semana.semana.desde} onCerrar={() => setNuevoTurnoAbierto(false)} onCreado={recargarSemana} />}
      </>
    );
  }

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
          <ToggleVistas vistaActual="dia" ancla={agenda.fecha} />
          {!vacio && agenda.sin_confirmar_manana > 0 && (
            <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[14px] font-medium text-ambar md:text-[12.5px]">Sin confirmar para mañana · {agenda.sin_confirmar_manana}</span>
          )}
          <button type="button" onClick={recargar} className="text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]">
            ↻ Actualizar
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => setNuevoTurnoAbierto(true)} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">
            Nuevo turno
          </button>
        </div>
        <div className="mb-4 text-[14px] text-grafito md:text-[13px]">{resumen}</div>

        {vacio ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={vacio.titulo} texto={vacio.texto} />
          </div>
        ) : (
          <Grilla agenda={agenda} abiertoId={abiertoId} onAbrir={setAbiertoId} onCambio={recargar} />
        )}
      </div>

      {/* Mobile — lista del día + hoja del turno tocado */}
      <div className="flex flex-1 flex-col md:hidden">
        <div className="px-4 pb-3 pt-[18px]">
          <div className="flex items-center">
            <div className="flex-1 font-serif text-[22px] font-semibold">Turnos</div>
            <button type="button" onClick={() => setNuevoTurnoAbierto(true)} className="rounded-otto bg-cobre px-3.5 py-2.5 text-[14px] font-medium text-lino">
              Nuevo turno
            </button>
          </div>
          <div className="mt-2.5">
            <Flechas fecha={agenda.fecha}>
              <div className="min-w-0 flex-1 text-center text-[15px] font-medium">{agenda.titulo}</div>
            </Flechas>
          </div>
          <div className="mt-2 text-[14px] leading-[1.45] text-grafito">{resumen}</div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {!vacio && agenda.sin_confirmar_manana > 0 && (
              <span className="rounded-pill border border-[#EEDFC0] bg-ambar-suave px-3 py-1.5 text-[14px] font-medium text-ambar">Sin confirmar mañana · {agenda.sin_confirmar_manana}</span>
            )}
            <SelectorVistaMobile vistaActual="dia" ancla={agenda.fecha} />
            <button type="button" onClick={recargar} className="text-[14px] text-tinta underline-offset-2">
              ↻ Actualizar
            </button>
          </div>
        </div>

        {vacio ? (
          <div className="mx-4 rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo={vacio.titulo} texto={vacio.texto} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4">
            {turnos.map((t) => (
              <FilaTurnoLista key={t.id} t={t} onAbrir={() => setAbiertoId(t.id)} />
            ))}
          </div>
        )}
      </div>
      {abierto && (
        <div className="md:hidden">
          <HojaTurno turno={abierto} onCerrar={() => setAbiertoId(null)} onCambio={recargar} />
        </div>
      )}
      {nuevoTurnoAbierto && <NuevoTurnoModal fechaInicial={agenda.fecha} onCerrar={() => setNuevoTurnoAbierto(false)} onCreado={recargar} />}
    </>
  );
}
