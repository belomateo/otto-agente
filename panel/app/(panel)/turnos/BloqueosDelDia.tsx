'use client';

// Bloquear un rato de la agenda desde Turnos (audio de Sofía, 12/11: «si quiero cancelar un probador o
// achicar horarios, por X motivo»). Es la pantalla de bloqueos_agenda (0067, /api/turnos/bloqueos), que
// existía sin botón: un probador o todos, de tal a tal hora. Lucía no ofrece turnos ahí. Lo puede hacer
// cualquiera del equipo; si el bloqueo deja el día sin ningún turno posible, la base dice que eso es
// cerrar el día (de la dueña). Los turnos que ya estaban en ese rato no se cancelan: se avisa cuáles son.

import { useState } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useUsuario } from '@/components/nav/UsuarioContext';
import { fechaEnZona } from '@/lib/formato';
import type { BloqueoDelDia, TurnoAfectado } from '@/lib/queries/bloqueos';

type Franja = { desde: string; hasta: string; probadores: number };

const hasta = (h: string) => (h === '24:00' ? 'el cierre' : h);

export function BloqueosDelDia({
  fecha,
  franjas,
  probadores,
  bloqueos,
  onCambio,
}: {
  fecha: string;
  franjas: Franja[];
  probadores: number;
  bloqueos: BloqueoDelDia[];
  onCambio: () => void;
}) {
  const esAdmin = useUsuario()?.rol === 'admin';
  const editable = fecha >= fechaEnZona(); // un día que ya pasó no se bloquea
  const apertura = franjas.length ? franjas.map((f) => f.desde).sort()[0] : '10:00';
  const cierre = franjas.length ? franjas.map((f) => f.hasta).sort().reverse()[0] : '19:00';

  const [abierto, setAbierto] = useState(false);
  const [que, setQue] = useState('todos'); // 'todos' o el número de probador
  const [desde, setDesde] = useState(apertura);
  const [hastaH, setHastaH] = useState(cierre);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [afectados, setAfectados] = useState<TurnoAfectado[] | null>(null);

  function cerrarForm() {
    setAbierto(false);
    setAfectados(null);
    setError(null);
    setMotivo('');
  }

  async function bloquear(confirmar: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/turnos/bloqueos', 'POST', {
        fecha,
        desde,
        hasta: hastaH,
        probador: que === 'todos' ? null : Number(que),
        motivo: motivo.trim() || null,
        confirmar,
      });
      cerrarForm();
      onCambio();
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 409) {
        setAfectados((e.detalle as { turnos_afectados?: TurnoAfectado[] } | undefined)?.turnos_afectados ?? []);
      } else {
        setError(e instanceof ErrorApi ? e.message : 'No se pudo bloquear');
      }
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(id: string) {
    setEnviando(true);
    setError(null);
    try {
      await enviar(`/api/turnos/bloqueos/${id}`, 'DELETE');
      onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo quitar el bloqueo');
    } finally {
      setEnviando(false);
    }
  }

  const campo = 'rounded-otto border border-borde bg-lino px-3 py-2 text-[14px] outline-none focus:border-cobre';

  return (
    <>
      {/* 12/11 (Mateo): bloquear y quitar bloqueos, solo Sofía y Mateo (admins); el equipo los ve. */}
      {editable && esAdmin && !abierto && (
        <button
          type="button"
          onClick={() => {
            setDesde(apertura);
            setHastaH(cierre);
            setAbierto(true);
          }}
          className="mb-3 flex-none text-[14px] text-tinta underline-offset-2 hover:underline md:text-[13px]"
        >
          Bloquear un horario o un probador
        </button>
      )}

      {bloqueos.length > 0 && (
        <div className="mb-3 flex basis-full flex-col gap-1.5">
          {bloqueos.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-otto border border-borde bg-hueso px-3 py-2 text-[14px] text-grafito md:text-[13px]">
              <span className="flex-1">
                <span className="font-medium text-tinta">Bloqueado</span> · {b.probador ? `Probador ${b.probador}` : 'Todos los probadores'} · {b.desde} a {hasta(b.hasta)}
                {b.motivo ? ` · ${b.motivo}` : ''}
              </span>
              {editable && esAdmin && (
                <button type="button" onClick={() => quitar(b.id)} disabled={enviando} className="flex-none rounded-otto border border-borde bg-lino px-3 py-1.5 font-medium text-tinta disabled:opacity-50">
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {abierto && (
        <div className="mb-3 flex basis-full flex-col gap-2 rounded-otto border border-borde bg-lino px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <label htmlFor={`que-bloqueo-${fecha}`} className="text-grafito md:text-[13px]">
              Qué
            </label>
            <select id={`que-bloqueo-${fecha}`} value={que} onChange={(e) => setQue(e.target.value)} className={campo}>
              <option value="todos">Todos los probadores (achicar el horario)</option>
              {Array.from({ length: probadores }, (_, i) => i + 1).map((p) => (
                <option key={p} value={String(p)}>
                  Probador {p}
                </option>
              ))}
            </select>
            <label htmlFor={`desde-bloqueo-${fecha}`} className="text-grafito md:text-[13px]">
              Desde
            </label>
            <input id={`desde-bloqueo-${fecha}`} type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
            <label htmlFor={`hasta-bloqueo-${fecha}`} className="text-grafito md:text-[13px]">
              Hasta
            </label>
            <input id={`hasta-bloqueo-${fecha}`} type="time" value={hastaH} onChange={(e) => setHastaH(e.target.value)} className={campo} />
            <button type="button" onClick={() => setDesde(apertura)} className="text-[13px] text-grafito underline-offset-2 hover:underline">
              desde la apertura
            </button>
            <button type="button" onClick={() => setHastaH(cierre)} className="text-[13px] text-grafito underline-offset-2 hover:underline">
              hasta el cierre
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <label htmlFor={`motivo-bloqueo-${fecha}`} className="text-grafito md:text-[13px]">
              Motivo
            </label>
            <input
              id={`motivo-bloqueo-${fecha}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Opcional: espejo roto, cerramos antes…"
              className={`min-w-[160px] flex-1 ${campo}`}
            />
            <button type="button" onClick={() => bloquear(false)} disabled={enviando || !desde || !hastaH} className="rounded-otto bg-cobre px-3.5 py-2 text-[14px] font-medium text-lino disabled:opacity-50">
              {enviando ? 'Guardando…' : 'Bloquear'}
            </button>
            <button type="button" onClick={cerrarForm} className="text-[14px] text-grafito underline-offset-2 hover:underline md:text-[13px]">
              Cancelar
            </button>
          </div>
          <div className="text-[13px] text-grafito">Lucía no va a ofrecer turnos en ese rato. Los turnos que ya están agendados no se tocan.</div>
          {afectados !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-otto border border-ambar bg-ambar-suave px-3 py-2 text-[14px] text-ambar">
              <span className="flex-1">
                Ese rato ya tiene {afectados.length} turno{afectados.length === 1 ? '' : 's'}
                {afectados.length ? `: ${afectados.map((t) => `${t.cliente} (${t.desde}, probador ${t.probador})`).join(', ')}` : ''}. No se cancelan: hay que avisarles.
              </span>
              <button type="button" onClick={() => bloquear(true)} disabled={enviando} className="flex-none rounded-otto border border-ambar bg-lino px-3 py-1.5 text-[14px] font-medium text-ambar disabled:opacity-50">
                {enviando ? 'Guardando…' : 'Bloquear igual'}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <div className="mb-3 basis-full text-[13px] text-ladrillo">{error}</div>}
    </>
  );
}
