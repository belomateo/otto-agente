'use client';

// «Mover» un turno (pedido de Mateo, 5/10: cualquiera del equipo da, edita y reagenda turnos):
// otro día, otro horario u otro tipo (invitado → doble cambia la duración). Mismo molde que
// «Nuevo turno»: se elige entre los huecos reales del día, nunca una hora libre. El GET de huecos
// va con excluir=<este turno> (no ocupa su propio lugar: se puede correr un rato el mismo día) y
// con cliente_id (ya respetan el margen de confección de su evento); el POST
// /api/turnos/<id>/mover vuelve a validar todo con la versión que se ve en pantalla.
//
// Si al cliente ya le había llegado el recordatorio del horario anterior, el nuevo no le llega
// solo (sale uno por turno): en vez de cerrarse, la ventana avisa que hay que decírselo. La agenda
// se recarga recién ahí, al tocar «Listo»: con el turno en otro día, recargar antes desmonta el
// popover que tiene esta ventana adentro y el aviso no se llegaría a leer.
//
// Va en un portal a <body>: se abre desde el popover de la grilla y desde la hoja del celular,
// que tienen su propio posicionamiento.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { enviar, ErrorApi, obtener } from '@/components/api/cliente';
import { ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import { fechaEnZona, fechaLarga, hora } from '@/lib/formato';
import type { FilaTurno } from '@/lib/queries/turnos';
import { AceptarInminente, CAMPO, ETIQUETA, esEventoInminente, type Hueco, ListaHuecos, TIPOS_TURNO } from './NuevoTurno';

const cuando = (iso: string) => `${fechaLarga(fechaEnZona(new Date(iso)))} a las ${hora(iso)}`;

export function MoverTurnoModal({ turno, onCerrar, onMovido }: { turno: FilaTurno; onCerrar: () => void; onMovido: () => void }) {
  const [tipo, setTipo] = useState(turno.tipo);
  const [fecha, setFecha] = useState(() => fechaEnZona(new Date(turno.inicio)));
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [cargandoHuecos, setCargandoHuecos] = useState(false);
  const [errorHuecos, setErrorHuecos] = useState<string | null>(null);
  const [inminente, setInminente] = useState(false);
  const [aceptarInminente, setAceptarInminente] = useState(false);
  const [elegido, setElegido] = useState<Hueco | null>(null);
  const [pisarUrgencia, setPisarUrgencia] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternativas, setAlternativas] = useState<Hueco[]>([]);
  // Movido, pero hay que avisarle al cliente: a dónde quedó.
  const [avisarDe, setAvisarDe] = useState<string | null>(null);

  useEffect(() => {
    setElegido(null);
    setPisarUrgencia(false);
    setAlternativas([]);
    setError(null);
    if (!tipo || !fecha) {
      setHuecos(null);
      return;
    }
    let vigente = true;
    setCargandoHuecos(true);
    setErrorHuecos(null);
    const params = new URLSearchParams({ fecha, tipo, cliente_id: turno.cliente_id, excluir: turno.id });
    if (aceptarInminente) params.set('evento_inminente', '1');
    obtener<{ huecos: Hueco[] }>(`/api/turnos/huecos?${params}`)
      .then((j) => vigente && setHuecos(j.huecos ?? []))
      .catch((e) => {
        if (!vigente) return;
        setHuecos(null);
        if (esEventoInminente(e)) setInminente(true);
        else setErrorHuecos(e instanceof ErrorApi ? e.message : 'No se pudieron traer los huecos');
      })
      .finally(() => vigente && setCargandoHuecos(false));
    return () => {
      vigente = false;
    };
  }, [tipo, fecha, aceptarInminente, turno.cliente_id, turno.id]);

  const puedeConfirmar = Boolean(elegido && (!elegido.dentro_urgencia || pisarUrgencia) && (!inminente || aceptarInminente));

  function listo() {
    onMovido();
    onCerrar();
  }

  async function confirmar(h: Hueco) {
    setEnviando(true);
    setError(null);
    setAlternativas([]);
    try {
      const r = await enviar<{ avisar_al_cliente?: boolean }>(`/api/turnos/${turno.id}/mover`, 'POST', {
        version: turno.version,
        inicio: h.inicio,
        probador: h.probador,
        ...(tipo !== turno.tipo ? { tipo } : {}),
        ...(h.dentro_urgencia ? { pisar_urgencia: true } : {}),
        ...(aceptarInminente ? { aceptar_evento_inminente: true } : {}),
      });
      if (r.avisar_al_cliente) setAvisarDe(cuando(h.inicio));
      else listo();
    } catch (e) {
      if (esEventoInminente(e)) {
        setInminente(true);
      } else if (e instanceof ErrorApi) {
        setError(e.message);
        const detalle = e.detalle as { alternativas?: Hueco[] } | undefined;
        if (detalle?.alternativas?.length) setAlternativas(detalle.alternativas);
      } else {
        setError('No se pudo mover el turno');
      }
    } finally {
      setEnviando(false);
    }
  }

  const cerrar = () => {
    if (enviando) return;
    if (avisarDe) listo();
    else onCerrar();
  };

  return createPortal(
    <div role="dialog" aria-label={`Mover el turno de ${turno.n}`} className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/[.32] p-4" onClick={cerrar}>
      <div className="flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-y-auto rounded-otto bg-lino p-4.5 shadow-otto-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-serif text-lg font-semibold">Mover turno</span>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-lg leading-none text-grafito">
            ×
          </button>
        </div>
        <div className="mb-3 text-[14px] leading-[1.45] text-grafito md:text-[13px]">
          {turno.n} · {ETIQUETA_TIPO_TURNO[turno.tipo] ?? turno.tipo}
          <br />
          Ahora: {cuando(turno.inicio)} · {turno.p}
        </div>

        {avisarDe ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-otto border border-ambar bg-ambar-suave p-3 text-[14px] leading-[1.45] text-ambar">
              Listo: el turno quedó el {avisarDe}. Al cliente ya le había llegado el recordatorio del horario anterior, así que el
              cambio no le llega solo: avisale por WhatsApp.
            </div>
            <button type="button" onClick={listo} className="self-start rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">
              Listo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className={ETIQUETA}>
                Tipo
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
                  {TIPOS_TURNO.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_TIPO_TURNO[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ETIQUETA}>
                Fecha
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
              </label>
            </div>

            {inminente && <AceptarInminente aceptado={aceptarInminente} onCambio={setAceptarInminente} />}

            {!(inminente && !aceptarInminente) && (
              <div>
                <div className={`mb-1.5 ${ETIQUETA.replace('flex flex-col gap-1 ', '')}`}>Horarios disponibles</div>
                {cargandoHuecos ? (
                  <div className="text-[14px] text-grafito">Buscando huecos…</div>
                ) : errorHuecos ? (
                  <div className="text-[14px] text-ladrillo">{errorHuecos}</div>
                ) : (
                  <ListaHuecos huecos={huecos ?? []} elegido={elegido} onElegir={setElegido} />
                )}
              </div>
            )}

            {elegido?.dentro_urgencia && (
              <label className="flex items-start gap-2 rounded-otto border border-ambar bg-ambar-suave p-2.5 text-[13px] leading-[1.4] text-ambar">
                <input type="checkbox" checked={pisarUrgencia} onChange={(e) => setPisarUrgencia(e.target.checked)} className="mt-0.5" />
                Ese horario está dentro del margen que normalmente se reserva por si surge algo urgente. Tildá esto solo si hace falta usarlo.
              </label>
            )}

            {error && (
              <div className="text-[13px] text-ladrillo">
                {error}
                {alternativas.length > 0 && (
                  <div className="mt-1.5">
                    <div className="mb-1 font-medium">Próximos horarios libres:</div>
                    <ListaHuecos huecos={alternativas} elegido={null} onElegir={(h) => confirmar(h)} />
                  </div>
                )}
              </div>
            )}

            <div className="mt-1 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => elegido && confirmar(elegido)}
                disabled={!puedeConfirmar || enviando}
                className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50"
              >
                {enviando ? 'Moviendo…' : 'Mover turno'}
              </button>
              <button type="button" onClick={cerrar} disabled={enviando} className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
