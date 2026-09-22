'use client';

// Configuración › Agenda — conectado a GET /api/configuracion (agenda) y los endpoints de
// horarios/franjas/duraciones/agenda (H1.8/H1.9, paneles, decisiones #7 y #9 del 14/9).
// `horarios` es el horario del LOCAL (atención humana, avisos fuera de horario), un día que no
// tiene fila está cerrado — hoy es el caso de domingo, y "Abrir este día" lo crea.
// `franjas_turnos` es aparte: cuándo se dan turnos, con varias franjas por día y su propia
// cantidad de probadores; se puede borrar una franja (la entidad es `borrable`) y queda en el
// historial. `duraciones_turno` solo edita los minutos: el tipo lo pone el código de agente.
// `cierres_agenda` (0061) son fechas puntuales sin turnos aparte del horario semanal — feriados,
// cierres excepcionales — conectado a /api/configuracion/cierres (paneles, pedido de Mateo
// 21/9, cerrado por logica el 22/9). Esta página entera ya es solo-admin: GET /api/configuracion
// exige admin, así que no hace falta gatear la sección de cierres aparte.

import { useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useEdicion } from '@/components/api/useEdicion';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { AccionesEdicion, CAMPO, ETIQUETA, TARJETA } from '../AccionesEdicion';
import { useConfiguracion } from '../ConfiguracionContexto';
import { fechaLarga } from '@/lib/formato';
import type { Configuracion } from '@/lib/queries/configuracion';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hhmm = (t: string) => t.slice(0, 5);

type FilaHorario = Configuracion['agenda']['horarios'][number];
type FilaFranja = Configuracion['agenda']['franjas'][number];
type FilaDuracion = Configuracion['agenda']['duraciones'][number];
type FilaConfig = NonNullable<Configuracion['agenda']['configuracion']>;
type FilaCierre = Configuracion['agenda']['cierres'][number];

// ---------- Horario del local ----------

function HorarioEditable({ fila, onCambio }: { fila: FilaHorario; onCambio: () => void }) {
  const edicion = useEdicion({
    version: fila.version,
    hora_apertura: hhmm(fila.hora_apertura),
    hora_cierre: hhmm(fila.hora_cierre),
    corte_desde: fila.corte_desde ? hhmm(fila.corte_desde) : '',
    corte_hasta: fila.corte_hasta ? hhmm(fila.corte_hasta) : '',
    activo: fila.activo,
  });
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/horarios/${fila.id}`, {
      hora_apertura: edicion.valor.hora_apertura,
      hora_cierre: edicion.valor.hora_cierre,
      corte_desde: edicion.valor.corte_desde || null,
      corte_hasta: edicion.valor.corte_hasta || null,
      activo: edicion.valor.activo,
    });
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  return (
    <div className={TARJETA}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">{fila.dia}</span>
        <label className="flex items-center gap-1.5 text-[14px] text-grafito md:text-xs">
          <input type="checkbox" checked={edicion.valor.activo} onChange={(e) => edicion.setValor({ ...edicion.valor, activo: e.target.checked })} />
          Abierto
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[14.5px]">
        <input type="time" value={edicion.valor.hora_apertura} onChange={(e) => edicion.setValor({ ...edicion.valor, hora_apertura: e.target.value })} className={`${CAMPO} w-auto`} />
        <span className="text-grafito">a</span>
        <input type="time" value={edicion.valor.hora_cierre} onChange={(e) => edicion.setValor({ ...edicion.valor, hora_cierre: e.target.value })} className={`${CAMPO} w-auto`} />
        <span className="ml-2 text-[14px] text-grafito md:text-xs">corte</span>
        <input type="time" value={edicion.valor.corte_desde} onChange={(e) => edicion.setValor({ ...edicion.valor, corte_desde: e.target.value })} className={`${CAMPO} w-auto`} />
        <span className="text-grafito">a</span>
        <input type="time" value={edicion.valor.corte_hasta} onChange={(e) => edicion.setValor({ ...edicion.valor, corte_hasta: e.target.value })} className={`${CAMPO} w-auto`} />
      </div>
      {toast}
      <AccionesEdicion sucio={edicion.sucio} guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} onVerHistorial={() => setHistorial(true)} />
      {historial && <PanelHistorial tabla="horarios" id={fila.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onCambio} />}
    </div>
  );
}

function DiaCerrado({ diaSemana, onCambio }: { diaSemana: number; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [apertura, setApertura] = useState('10:00');
  const [cierre, setCierre] = useState('19:00');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/horarios', 'POST', { dia_semana: diaSemana, hora_apertura: apertura, hora_cierre: cierre, activo: true });
      onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo abrir el día');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={`${TARJETA} bg-[#FBFAF7]`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">{DIAS[diaSemana]}</span>
        <span className="text-[14px] text-[#8A8578] md:text-xs">Cerrado</span>
      </div>
      {abierto ? (
        <div className="flex flex-wrap items-center gap-2 text-[14.5px]">
          <input type="time" value={apertura} onChange={(e) => setApertura(e.target.value)} className={`${CAMPO} w-auto`} />
          <span className="text-grafito">a</span>
          <input type="time" value={cierre} onChange={(e) => setCierre(e.target.value)} className={`${CAMPO} w-auto`} />
          <button type="button" onClick={crear} disabled={enviando} className="rounded-otto bg-cobre px-3.5 py-2 text-[14px] font-medium text-lino disabled:opacity-50">
            {enviando ? 'Abriendo…' : 'Abrir'}
          </button>
          <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="rounded-otto border border-borde bg-lino px-3 py-2 text-[14px] font-medium text-grafito">
            Cancelar
          </button>
          {error && <div className="w-full text-[13px] text-ladrillo">{error}</div>}
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="rounded-[7px] border border-cobre bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre md:text-[12.5px]">
          Abrir este día
        </button>
      )}
    </div>
  );
}

// ---------- Franjas de turnos ----------

function FranjaEditable({ fila, probadoresLocal, onCambio }: { fila: FilaFranja; probadoresLocal: number; onCambio: () => void }) {
  const edicion = useEdicion({ version: fila.version, dia_semana: fila.dia_semana, desde: hhmm(fila.desde), hasta: hhmm(fila.hasta), probadores: fila.probadores });
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/franjas/${fila.id}`, { desde: edicion.valor.desde, hasta: edicion.valor.hasta, probadores: edicion.valor.probadores });
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  async function borrar() {
    setBorrando(true);
    try {
      await enviar(`/api/configuracion/franjas/${fila.id}`, 'DELETE', { version: edicion.guardado.version });
      onCambio();
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo borrar', true);
      setBorrando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-borde-suave py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 text-[14.5px]">
        <input type="time" value={edicion.valor.desde} onChange={(e) => edicion.setValor({ ...edicion.valor, desde: e.target.value })} className={`${CAMPO} w-auto`} />
        <span className="text-grafito">a</span>
        <input type="time" value={edicion.valor.hasta} onChange={(e) => edicion.setValor({ ...edicion.valor, hasta: e.target.value })} className={`${CAMPO} w-auto`} />
        <input
          type="number"
          min={1}
          max={probadoresLocal}
          value={edicion.valor.probadores}
          onChange={(e) => edicion.setValor({ ...edicion.valor, probadores: Number(e.target.value) || 1 })}
          className={`${CAMPO} w-[68px]`}
        />
        <span className="text-[14px] text-grafito md:text-xs">probadores</span>
        <button type="button" onClick={borrar} disabled={borrando} className="ml-auto text-[14px] text-ladrillo disabled:opacity-50">
          {borrando ? 'Borrando…' : 'Borrar'}
        </button>
      </div>
      {toast}
      {edicion.sucio && (
        <AccionesEdicion sucio guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} onVerHistorial={() => setHistorial(true)} />
      )}
      {!edicion.sucio && (
        <button type="button" onClick={() => setHistorial(true)} className="self-start text-[14px] text-tinta underline-offset-2 hover:underline md:text-xs">
          Ver versión anterior
        </button>
      )}
      {historial && <PanelHistorial tabla="franjas_turnos" id={fila.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onCambio} />}
    </div>
  );
}

function NuevaFranja({ diaSemana, probadoresLocal, onCreado }: { diaSemana: number; probadoresLocal: number; onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState('13:00');
  const [hasta, setHasta] = useState('19:00');
  const [probadores, setProbadores] = useState(probadoresLocal);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/franjas', 'POST', { dia_semana: diaSemana, desde, hasta, probadores });
      setAbierto(false);
      onCreado();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-1.5 self-start rounded-[7px] border border-cobre bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre md:text-[12.5px]">
        + Franja
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-borde-suave pt-2 text-[14.5px]">
      <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${CAMPO} w-auto`} />
      <span className="text-grafito">a</span>
      <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${CAMPO} w-auto`} />
      <input type="number" min={1} max={probadoresLocal} value={probadores} onChange={(e) => setProbadores(Number(e.target.value) || 1)} className={`${CAMPO} w-[68px]`} />
      <span className="text-[14px] text-grafito md:text-xs">probadores</span>
      <button type="button" onClick={crear} disabled={enviando} className="rounded-otto bg-cobre px-3.5 py-2 text-[14px] font-medium text-lino disabled:opacity-50">
        {enviando ? 'Creando…' : 'Crear'}
      </button>
      <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="rounded-otto border border-borde bg-lino px-3 py-2 text-[14px] font-medium text-grafito">
        Cancelar
      </button>
      {error && <div className="w-full text-[13px] text-ladrillo">{error}</div>}
    </div>
  );
}

function DiaFranjas({ diaSemana, franjas, probadoresLocal, onCambio }: { diaSemana: number; franjas: FilaFranja[]; probadoresLocal: number; onCambio: () => void }) {
  return (
    <div className={TARJETA}>
      <div className="mb-1 flex items-center gap-2">
        <span className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">{DIAS[diaSemana]}</span>
        {franjas.length === 0 && <span className="text-[14px] text-[#8A8578] md:text-xs">No se dan turnos</span>}
      </div>
      {franjas.map((f) => (
        <FranjaEditable key={`${f.id}-${f.version}`} fila={f} probadoresLocal={probadoresLocal} onCambio={onCambio} />
      ))}
      <NuevaFranja diaSemana={diaSemana} probadoresLocal={probadoresLocal} onCreado={onCambio} />
    </div>
  );
}

// ---------- Duraciones ----------

function DuracionEditable({ fila, onCambio }: { fila: FilaDuracion; onCambio: () => void }) {
  const edicion = useEdicion({ version: fila.version, duracion_min: fila.duracion_min });
  const { toast, mostrar } = useToastLocal();

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/duraciones/${fila.id}`, { duracion_min: edicion.valor.duracion_min });
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  return (
    <div className="flex items-center gap-2.5 border-t border-borde-suave py-2 first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-[14.5px]">{fila.tipo}</span>
      <input
        type="number"
        min={5}
        max={600}
        value={edicion.valor.duracion_min}
        onChange={(e) => edicion.setValor({ ...edicion.valor, duracion_min: Number(e.target.value) || 5 })}
        className={`${CAMPO} w-[72px]`}
      />
      <span className="text-[14px] text-grafito md:text-xs">min</span>
      {edicion.sucio && (
        <button type="button" onClick={guardar} disabled={edicion.guardando} className="rounded-otto bg-cobre px-3.5 py-1.5 text-[14px] font-medium text-lino disabled:opacity-50">
          {edicion.guardando ? 'Guardando…' : 'Guardar'}
        </button>
      )}
      {toast}
    </div>
  );
}

// ---------- Configuración general ----------

function ConfiguracionAgendaForm({ fila, onCambio }: { fila: FilaConfig; onCambio: () => void }) {
  const edicion = useEdicion({
    version: fila.version,
    cantidad_probadores: fila.cantidad_probadores,
    escalonado_min: fila.escalonado_min,
    dias_reserva_urgencia: fila.dias_reserva_urgencia,
    // La columna admite null en la base (histórico), pero el aviso siempre tiene un valor
    // real puesto (seed 30, decisión #10): si por algo faltara, 30 es el que ya se usa hoy.
    aviso_turno_min: fila.aviso_turno_min ?? 30,
  });
  const { toast, mostrar } = useToastLocal();
  const sinReserva = edicion.valor.dias_reserva_urgencia === null;

  async function guardar() {
    const err = await edicion.guardar('/api/configuracion/agenda', edicion.valor);
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  return (
    <div className={TARJETA}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <label className={ETIQUETA}>
          Probadores
          <input type="number" min={1} max={20} value={edicion.valor.cantidad_probadores} onChange={(e) => edicion.setValor({ ...edicion.valor, cantidad_probadores: Number(e.target.value) || 1 })} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Escalonado (min)
          <input type="number" min={1} max={120} value={edicion.valor.escalonado_min} onChange={(e) => edicion.setValor({ ...edicion.valor, escalonado_min: Number(e.target.value) || 1 })} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Aviso de turno (min antes)
          <input type="number" min={1} max={240} value={edicion.valor.aviso_turno_min} onChange={(e) => edicion.setValor({ ...edicion.valor, aviso_turno_min: Number(e.target.value) || 1 })} className={CAMPO} />
        </label>
        <label className={ETIQUETA}>
          Reserva de urgencia (días)
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              disabled={sinReserva}
              value={edicion.valor.dias_reserva_urgencia ?? ''}
              onChange={(e) => edicion.setValor({ ...edicion.valor, dias_reserva_urgencia: Number(e.target.value) || 1 })}
              className={`${CAMPO} disabled:bg-hueso`}
            />
            <label className="flex flex-none items-center gap-1.5 text-[14px] text-grafito md:text-xs">
              <input
                type="checkbox"
                checked={sinReserva}
                onChange={(e) => edicion.setValor({ ...edicion.valor, dias_reserva_urgencia: e.target.checked ? null : 7 })}
              />
              Sin reserva
            </label>
          </div>
        </label>
      </div>
      {toast}
      <AccionesEdicion sucio={edicion.sucio} guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} />
    </div>
  );
}

// ---------- Cierres puntuales (feriados) ----------

// GET/POST /api/configuracion/cierres, DELETE /api/configuracion/cierres/<fecha> (0061, pedido
// de Mateo 21/9): además del horario semanal de arriba, una fecha puntual (feriado, cierre
// excepcional) puede quedar sin turnos. Cerrar NO cancela los turnos que ya tenía esa fecha —
// si hay, el servidor devuelve 409 con cuántos son (turno-alta.ts:14, mismo criterio que
// pisar_urgencia: una decisión de negocio, nunca implícita) y acá se muestra para que confirmen
// a sabiendas antes de reenviar con confirmar: true.

function CierreExistente({ fila, onCambio }: { fila: FilaCierre; onCambio: () => void }) {
  const { toast, mostrar } = useToastLocal();
  const [borrando, setBorrando] = useState(false);

  async function reabrir() {
    setBorrando(true);
    try {
      await enviar(`/api/configuracion/cierres/${fila.fecha}`, 'DELETE');
      onCambio();
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo reabrir', true);
      setBorrando(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5 border-t border-borde-suave py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-medium">{fechaLarga(fila.fecha)}</div>
        {fila.motivo && <div className="text-[14px] text-grafito md:text-xs">{fila.motivo}</div>}
      </div>
      <button type="button" onClick={reabrir} disabled={borrando} className="flex-none text-[14px] text-ladrillo disabled:opacity-50">
        {borrando ? 'Reabriendo…' : 'Reabrir'}
      </button>
      {toast}
    </div>
  );
}

function NuevoCierre({ onCreado }: { onCreado: () => void }) {
  const [fecha, setFecha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnosAfectados, setTurnosAfectados] = useState<number | null>(null);

  async function crear(confirmar: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/cierres', 'POST', { fecha, motivo: motivo.trim() || null, confirmar });
      setFecha('');
      setMotivo('');
      setTurnosAfectados(null);
      onCreado();
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 409) {
        const detalle = e.detalle as { turnos_afectados?: number } | undefined;
        setTurnosAfectados(detalle?.turnos_afectados ?? 0);
      } else {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cerrar el día');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2 border-t border-borde-suave pt-2">
      <div className="flex flex-wrap items-center gap-2 text-[14.5px]">
        <input
          type="date"
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setTurnosAfectados(null);
          }}
          className={`${CAMPO} w-auto`}
        />
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional) — feriado, evento…"
          className={`${CAMPO} min-w-[200px] flex-1`}
        />
        <button type="button" onClick={() => crear(false)} disabled={!fecha || enviando} className="rounded-otto bg-cobre px-3.5 py-2 text-[14px] font-medium text-lino disabled:opacity-50">
          {enviando ? 'Cerrando…' : 'Cerrar este día'}
        </button>
      </div>
      {turnosAfectados !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-otto border border-ambar bg-ambar-suave px-3 py-2 text-[14px] text-ambar">
          <span className="flex-1">
            Ese día ya tiene {turnosAfectados} turno{turnosAfectados === 1 ? '' : 's'}. Cerrarlo no los cancela, quedan como están.
          </span>
          <button type="button" onClick={() => crear(true)} disabled={enviando} className="flex-none rounded-otto border border-ambar bg-lino px-3 py-1.5 text-[14px] font-medium text-ambar disabled:opacity-50">
            {enviando ? 'Cerrando…' : 'Cerrar igual'}
          </button>
        </div>
      )}
      {error && <div className="text-[13px] text-ladrillo">{error}</div>}
    </div>
  );
}

function CierresAgenda({ cierres, onCambio }: { cierres: FilaCierre[]; onCambio: () => void }) {
  return (
    <div className={TARJETA}>
      {cierres.length === 0 ? (
        <div className="text-[14px] text-[#8A8578] md:text-xs">Sin feriados ni cierres cargados.</div>
      ) : (
        cierres.map((c) => <CierreExistente key={c.fecha} fila={c} onCambio={onCambio} />)
      )}
      <NuevoCierre onCreado={onCambio} />
    </div>
  );
}

// ---------- Página ----------

export default function AgendaPage() {
  const { datos, cargando, error, recargar } = useConfiguracion();

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  const { horarios, franjas, duraciones, configuracion, cierres } = datos.agenda;
  const probadoresLocal = configuracion?.cantidad_probadores ?? 1;

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <h2 className="mt-1 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">Horario del local</h2>
        {[0, 1, 2, 3, 4, 5, 6].map((dia) => {
          const fila = horarios.find((h) => h.dia_semana === dia);
          return fila ? <HorarioEditable key={`${fila.id}-${fila.version}`} fila={fila} onCambio={recargar} /> : <DiaCerrado key={dia} diaSemana={dia} onCambio={recargar} />;
        })}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="mt-1 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">Feriados y cierres puntuales</h2>
        <CierresAgenda cierres={cierres} onCambio={recargar} />
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="mt-1 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">Franjas de turnos</h2>
        {[0, 1, 2, 3, 4, 5, 6].map((dia) => (
          <DiaFranjas key={dia} diaSemana={dia} franjas={franjas.filter((f) => f.dia_semana === dia)} probadoresLocal={probadoresLocal} onCambio={recargar} />
        ))}
      </section>

      <section className={TARJETA}>
        <h2 className="mb-1.5 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">Duración por tipo de turno</h2>
        {duraciones.map((d) => (
          <DuracionEditable key={`${d.id}-${d.version}`} fila={d} onCambio={recargar} />
        ))}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="mt-1 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">Configuración general</h2>
        {configuracion ? (
          <ConfiguracionAgendaForm fila={configuracion} onCambio={recargar} />
        ) : (
          <div className={TARJETA}>Todavía no está cargada la configuración general de la agenda.</div>
        )}
      </section>
    </>
  );
}
