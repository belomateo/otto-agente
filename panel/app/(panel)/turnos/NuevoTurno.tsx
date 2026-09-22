'use client';

// «Nuevo turno» (H1.8, decisión de Mateo 16/9 y 19/9): el mostrador agenda a alguien que llegó
// sin turno, o por teléfono. GET /api/turnos/huecos ofrece los horarios reservables de verdad
// para el tipo y la fecha elegidos — nunca un campo de hora libre, así nadie promete un horario
// que el POST después rechaza. POST /api/turnos hace el alta (y de paso el cliente nuevo, si
// hace falta, en el mismo paso).
//
// TIPOS_TURNO vive en lib/edicion/turno-alta.ts, pero ese archivo es 'server-only' (importa
// calcularHuecos de supabase/functions/_shared, que tira si Turbopack lo intenta meter en el
// bundle del cliente) — no se puede importar acá tal cual. Se deriva de ETIQUETA_TIPO_TURNO
// (lib/etiquetas.ts, sin 'server-only', ya con las 6 etiquetas) en vez de hardcodear una lista
// nueva: mismo criterio que ya se usó para no importar ClaveEntidad de lib/edicion/entidades.ts
// en PanelHistorial.tsx. Las dos listas tienen que tener las mismas claves — si alguien suma un
// tipo de turno nuevo del lado del servidor y no lo agrega acá, el select simplemente no lo
// ofrece (no rompe nada, pero avisar si eso pasa).
//
// cliente_id se omite del GET de huecos a propósito (es opcional en el contrato): si ya se
// buscó y eligió un cliente antes de ver los huecos, se podría mandar para que la vista previa
// tenga en cuenta el margen de confección de su evento — no lo hago para no atar el orden en
// que se llenan los campos del formulario. El POST vuelve a calcular todo con el cliente real
// al confirmar, así que nunca hay drift entre lo que se mostró y lo que quedó guardado.

import { useEffect, useState } from 'react';
import { enviar, ErrorApi, obtener } from '@/components/api/cliente';
import { ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import type { FilaCliente } from '@/lib/queries/clientes';

const TIPOS_TURNO = Object.keys(ETIQUETA_TIPO_TURNO);

type Hueco = { inicio: string; fin: string; probador: number; dentro_urgencia: boolean };

const ETIQUETA = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';

function horaCortaISO(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Huecos reales del tipo+fecha elegidos — nunca una hora libre para escribir. Los que caen
// dentro de la reserva de urgencia se ofrecen igual, pero marcados: elegirlos exige tildar
// "pisar la urgencia" más abajo antes de poder confirmar (checkbox explícito, nunca implícito
// — turno-alta.ts:14, decisión de Mateo).
function ListaHuecos({ huecos, elegido, onElegir }: { huecos: Hueco[]; elegido: Hueco | null; onElegir: (h: Hueco) => void }) {
  if (huecos.length === 0) return <div className="text-[14px] text-grafito">No hay huecos para ese tipo y esa fecha.</div>;
  const ordenados = [...huecos].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.probador - b.probador);
  return (
    <div className="flex flex-wrap gap-1.5">
      {ordenados.map((h) => {
        const activo = elegido?.inicio === h.inicio && elegido?.probador === h.probador;
        return (
          <button
            key={`${h.inicio}-${h.probador}`}
            type="button"
            onClick={() => onElegir(h)}
            className={`rounded-otto border px-2.5 py-1.5 text-[13px] font-medium ${
              activo
                ? 'border-cobre bg-cobre text-lino'
                : h.dentro_urgencia
                  ? 'border-ambar bg-ambar-suave text-ambar'
                  : 'border-borde bg-lino text-grafito'
            }`}
          >
            {horaCortaISO(h.inicio)} · P{h.probador}
            {h.dentro_urgencia && !activo && ' ⚠'}
          </button>
        );
      })}
    </div>
  );
}

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
        // obtener() (no fetch crudo) para no confundir un 403 de permisos con "no existe" —
        // r.json() sin mirar r.ok mostraba "Nadie con ese nombre o teléfono" para los dos casos.
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
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [cargandoHuecos, setCargandoHuecos] = useState(false);
  const [errorHuecos, setErrorHuecos] = useState<string | null>(null);
  const [huecoElegido, setHuecoElegido] = useState<Hueco | null>(null);
  const [pisarUrgencia, setPisarUrgencia] = useState(false);
  const [clienteElegido, setClienteElegido] = useState<{ id: string; nombre: string } | null>(null);
  const [telefono, setTelefono] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternativas, setAlternativas] = useState<Hueco[]>([]);

  useEffect(() => {
    setHuecoElegido(null);
    setPisarUrgencia(false);
    setAlternativas([]);
    if (!tipo || !fecha) {
      setHuecos(null);
      return;
    }
    setCargandoHuecos(true);
    setErrorHuecos(null);
    fetch(`/api/turnos/huecos?fecha=${fecha}&tipo=${tipo}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new ErrorApi(r.status, j?.error ?? 'No se pudieron traer los huecos', j?.detalle);
        setHuecos(j.huecos ?? []);
      })
      .catch((e) => setErrorHuecos(e instanceof ErrorApi ? e.message : 'No se pudieron traer los huecos'))
      .finally(() => setCargandoHuecos(false));
  }, [tipo, fecha]);

  const puedeConfirmar = Boolean(tipo && huecoElegido && (clienteElegido || telefono.trim()) && (!huecoElegido.dentro_urgencia || pisarUrgencia));

  async function confirmar(hueco: Hueco) {
    setEnviando(true);
    setError(null);
    setAlternativas([]);
    try {
      await enviar('/api/turnos', 'POST', {
        ...(clienteElegido ? { cliente_id: clienteElegido.id } : { cliente_nuevo: { telefono: telefono.trim(), nombre: nombreNuevo.trim() || undefined } }),
        tipo,
        probador: hueco.probador,
        inicio: hueco.inicio,
        ...(hueco.dentro_urgencia ? { pisar_urgencia: true } : {}),
      });
      onCreado();
      onCerrar();
    } catch (e) {
      if (e instanceof ErrorApi) {
        setError(e.message);
        const detalle = e.detalle as { alternativas?: Hueco[] } | undefined;
        if (detalle?.alternativas?.length) setAlternativas(detalle.alternativas);
      } else {
        setError('No se pudo crear el turno');
      }
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
          <div className="grid grid-cols-2 gap-2">
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
            <label className={ETIQUETA}>
              Fecha
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            </label>
          </div>

          {tipo && fecha && (
            <div>
              <div className={`mb-1.5 ${ETIQUETA.replace('flex flex-col gap-1 ', '')}`}>Horarios disponibles</div>
              {cargandoHuecos ? (
                <div className="text-[14px] text-grafito">Buscando huecos…</div>
              ) : errorHuecos ? (
                <div className="text-[14px] text-ladrillo">{errorHuecos}</div>
              ) : (
                <ListaHuecos huecos={huecos ?? []} elegido={huecoElegido} onElegir={setHuecoElegido} />
              )}
            </div>
          )}

          {huecoElegido?.dentro_urgencia && (
            <label className="flex items-start gap-2 rounded-otto border border-ambar bg-ambar-suave p-2.5 text-[13px] leading-[1.4] text-ambar">
              <input type="checkbox" checked={pisarUrgencia} onChange={(e) => setPisarUrgencia(e.target.checked)} className="mt-0.5" />
              Ese horario está dentro del margen que normalmente se reserva por si surge algo urgente. Tildá esto solo si el cliente ya está en el local esperando.
            </label>
          )}

          {huecoElegido && (
            <BuscadorCliente
              clienteElegido={clienteElegido}
              onElegirCliente={setClienteElegido}
              telefono={telefono}
              nombre={nombreNuevo}
              onTelefono={setTelefono}
              onNombre={setNombreNuevo}
            />
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
              onClick={() => huecoElegido && confirmar(huecoElegido)}
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
