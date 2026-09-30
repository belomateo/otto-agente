'use client';

// «Nuevo turno» — el mostrador agenda manualmente.
// Cambio del 29/9 (Mateo): en vez de elegir de una lista de huecos calculados, el admin
// escribe la hora directamente y elige cuántos probadores quiere ocupar (1, 2 o 3). El backend
// (turno-alta.ts, modo libre) toma los primeros N probadores libres en ese horario; si están
// todos ocupados, devuelve el error. La constraint GiST de la base (0011) impide solapamientos.
// El admin puede poner cualquier hora —fuera de las franjas, en horario de urgencia, etc.— sin
// tener que tildar nada: confiar en el criterio del equipo > mostrar advertencias.
//
// TIPOS_TURNO: mismo criterio que antes —derivado de ETIQUETA_TIPO_TURNO, no de server-only.

import { useState } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import type { FilaCliente } from '@/lib/queries/clientes';
import { obtener } from '@/components/api/cliente';
import { useEffect } from 'react';

const TIPOS_TURNO = Object.keys(ETIQUETA_TIPO_TURNO);

const ETIQUETA = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';

function BuscadorCliente({
  clienteElegido,
  onElegirCliente,
  telefono,
  nombre,
  onTelefono,
  onNombre,
}: {
  clienteElegido: { id: string; nombre: string } | null;
  onElegirCliente: (c: { id: string; nombre: string } | null) => void;
  telefono: string;
  nombre: string;
  onTelefono: (v: string) => void;
  onNombre: (v: string) => void;
}) {
  const [modo, setModo] = useState<'buscar' | 'nuevo'>('buscar');
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<FilaCliente[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== 'buscar' || clienteElegido || !busqueda.trim()) {
      setResultados(null);
      setErrorBusqueda(null);
      return;
    }
    setBuscando(true);
    setErrorBusqueda(null);
    const id = setTimeout(async () => {
      try {
        const j = await obtener<{ clientes: FilaCliente[] }>(`/api/clientes?q=${encodeURIComponent(busqueda.trim())}`);
        setResultados(j.clientes ?? []);
      } catch (e) {
        setResultados([]);
        setErrorBusqueda(e instanceof ErrorApi ? e.message : 'No se pudo buscar');
      } finally {
        setBuscando(false);
      }
    }, 280);
    return () => clearTimeout(id);
  }, [busqueda, modo, clienteElegido]);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2.5">
        <div className={ETIQUETA.replace('flex flex-col gap-1 ', '')}>Cliente</div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setModo(modo === 'buscar' ? 'nuevo' : 'buscar');
            onElegirCliente(null);
          }}
          className="text-[13px] font-medium text-cobre underline-offset-2 hover:underline"
        >
          {modo === 'buscar' ? '+ Cliente nuevo' : 'Buscar uno que ya existe'}
        </button>
      </div>
      {modo === 'nuevo' ? (
        <div className="grid grid-cols-2 gap-2">
          <input value={telefono} onChange={(e) => onTelefono(e.target.value)} placeholder="Teléfono" className={CAMPO} />
          <input value={nombre} onChange={(e) => onNombre(e.target.value)} placeholder="Nombre (opcional)" className={CAMPO} />
        </div>
      ) : clienteElegido ? (
        <div className="flex items-center gap-2 rounded-otto border border-cobre bg-cobre-claro/40 px-2.5 py-2 text-sm">
          <span className="flex-1 truncate font-medium">{clienteElegido.nombre}</span>
          <button type="button" onClick={() => onElegirCliente(null)} className="text-[13px] text-grafito underline">
            Cambiar
          </button>
        </div>
      ) : (
        <div>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o teléfono" className={CAMPO} />
          {busqueda.trim() && (
            <div className="mt-1.5 flex flex-col gap-1 rounded-otto border border-borde bg-lino p-1.5">
              {buscando ? (
                <div className="px-2 py-1.5 text-[13px] text-grafito">Buscando…</div>
              ) : errorBusqueda ? (
                <div className="px-2 py-1.5 text-[13px] text-ladrillo">{errorBusqueda}</div>
              ) : resultados && resultados.length > 0 ? (
                resultados.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onElegirCliente({ id: c.id, nombre: c.n });
                      setBusqueda('');
                    }}
                    className="rounded px-2 py-1.5 text-left text-[13px] hover:bg-hueso"
                  >
                    <span className="font-medium">{c.n}</span> <span className="text-grafito">· {c.tel}</span>
                  </button>
                ))
              ) : (
                <div className="px-2 py-1.5 text-[13px] text-grafito">Nadie con ese nombre o teléfono.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NuevoTurnoModal({ fechaInicial, onCerrar, onCreado }: { fechaInicial: string; onCerrar: () => void; onCreado: () => void }) {
  const [tipo, setTipo] = useState('');
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState('');
  const [cantidadProbadores, setCantidadProbadores] = useState<1 | 2 | 3>(1);
  const [clienteElegido, setClienteElegido] = useState<{ id: string; nombre: string } | null>(null);
  const [telefono, setTelefono] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeConfirmar = Boolean(tipo && fecha && hora && (clienteElegido || telefono.trim()));

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/turnos', 'POST', {
        ...(clienteElegido ? { cliente_id: clienteElegido.id } : { cliente_nuevo: { telefono: telefono.trim(), nombre: nombreNuevo.trim() || undefined } }),
        tipo,
        fecha_libre: fecha,
        hora_libre: hora,
        cantidad_probadores: cantidadProbadores,
      });
      onCreado();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear el turno');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div role="dialog" aria-label="Nuevo turno" className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/[.32] p-4" onClick={() => !enviando && onCerrar()}>
      <div className="flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-y-auto rounded-otto bg-lino p-4.5 shadow-otto-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-serif text-lg font-semibold">Nuevo turno</span>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-lg leading-none text-grafito">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Tipo */}
          <label className={ETIQUETA}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
              <option value="">Elegir…</option>
              {TIPOS_TURNO.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_TURNO[t]}
                </option>
              ))}
            </select>
          </label>

          {/* Fecha y hora */}
          <div className="grid grid-cols-2 gap-2">
            <label className={ETIQUETA}>
              Fecha
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            </label>
            <label className={ETIQUETA}>
              Hora
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
            </label>
          </div>

          {/* Probadores */}
          <div>
            <div className={`mb-1.5 ${ETIQUETA.replace('flex flex-col gap-1 ', '')}`}>Probadores</div>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCantidadProbadores(n)}
                  className={`rounded-otto border px-4 py-2 text-sm font-medium ${
                    cantidadProbadores === n ? 'border-cobre bg-cobre text-lino' : 'border-borde bg-lino text-grafito'
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="self-center text-[13px] text-grafito">
                {cantidadProbadores === 1 ? 'probador' : 'probadores'}
              </span>
            </div>
          </div>

          {/* Cliente */}
          <BuscadorCliente
            clienteElegido={clienteElegido}
            onElegirCliente={setClienteElegido}
            telefono={telefono}
            nombre={nombreNuevo}
            onTelefono={setTelefono}
            onNombre={setNombreNuevo}
          />

          {error && <div className="text-[13px] text-ladrillo">{error}</div>}

          <div className="mt-1 flex items-center gap-2.5">
            <button
              type="button"
              onClick={confirmar}
              disabled={!puedeConfirmar || enviando}
              className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50"
            >
              {enviando ? 'Creando…' : 'Crear turno'}
            </button>
            <button type="button" onClick={onCerrar} disabled={enviando} className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
