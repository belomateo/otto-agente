'use client';

// Configuración › Respuestas rápidas (0109, pedido de Sofía 22/10): los textos que el equipo
// inserta escribiendo "/" en el chat de la Bandeja. Mismo molde que Enlaces/Notas (useEdicion,
// historial); suma subir/bajar (cambia `orden` con la vecina) y borrar (queda en el historial).

import { useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useDatos } from '@/components/api/useDatos';
import { useEdicion } from '@/components/api/useEdicion';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { AccionesEdicion, CAMPO, ETIQUETA, TARJETA } from '../AccionesEdicion';
import type { RespuestaRapida } from '@/lib/respuestas-rapidas';

type Fila = RespuestaRapida & { version: number };
const campos = (r: Fila) => ({ version: r.version, atajo: r.atajo, texto: r.texto, activo: r.activo });
const BOTON_CHICO = 'rounded-otto border border-borde bg-lino px-2.5 py-1 text-[13px] text-grafito disabled:opacity-40';

function RespuestaEditable({ fila, arriba, abajo, onCambio }: { fila: Fila; arriba?: Fila; abajo?: Fila; onCambio: () => void }) {
  const edicion = useEdicion(campos(fila));
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);
  const [moviendo, setMoviendo] = useState(false);

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/respuestas/${fila.id}`, edicion.valor);
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  // Intercambia el orden con la vecina; si tenían el mismo número, solo se corre esta.
  async function mover(otra: Fila, haciaArriba: boolean) {
    setMoviendo(true);
    try {
      const mio = otra.orden === fila.orden ? fila.orden + (haciaArriba ? -1 : 1) : otra.orden;
      await enviar(`/api/configuracion/respuestas/${fila.id}`, 'PATCH', { version: fila.version, orden: Math.max(0, mio) });
      if (otra.orden !== fila.orden) await enviar(`/api/configuracion/respuestas/${otra.id}`, 'PATCH', { version: otra.version, orden: fila.orden });
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo mover', true);
    } finally {
      setMoviendo(false);
      onCambio();
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar la respuesta «/${fila.atajo}»?`)) return;
    try {
      await enviar(`/api/configuracion/respuestas/${fila.id}`, 'DELETE', { version: fila.version });
      onCambio();
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo borrar', true);
    }
  }

  return (
    <div className={TARJETA}>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">Atajo (se busca escribiendo /)</label>
        <button type="button" onClick={() => arriba && mover(arriba, true)} disabled={!arriba || moviendo} aria-label="Subir" className={BOTON_CHICO}>↑</button>
        <button type="button" onClick={() => abajo && mover(abajo, false)} disabled={!abajo || moviendo} aria-label="Bajar" className={BOTON_CHICO}>↓</button>
        <label className="flex items-center gap-1.5 text-[14px] text-grafito md:text-xs">
          <input type="checkbox" checked={edicion.valor.activo} onChange={(e) => edicion.setValor({ ...edicion.valor, activo: e.target.checked })} />
          Activa
        </label>
      </div>
      <input value={edicion.valor.atajo} onChange={(e) => edicion.setValor({ ...edicion.valor, atajo: e.target.value })} className={CAMPO} />
      <label className={`${ETIQUETA} mt-2.5`}>Texto</label>
      <textarea rows={4} value={edicion.valor.texto} onChange={(e) => edicion.setValor({ ...edicion.valor, texto: e.target.value })} className={CAMPO} />
      {toast}
      <AccionesEdicion sucio={edicion.sucio} guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} onVerHistorial={() => setHistorial(true)} />
      <button type="button" onClick={borrar} className="mt-2 self-start text-[13px] text-ladrillo">Borrar</button>
      {historial && <PanelHistorial tabla="respuestas_rapidas" id={fila.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onCambio} />}
    </div>
  );
}

function NuevaRespuesta({ siguienteOrden, onCreada }: { siguienteOrden: number; onCreada: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [atajo, setAtajo] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/respuestas', 'POST', { atajo, texto, orden: siguienteOrden, activo: true });
      setAtajo('');
      setTexto('');
      setAbierto(false);
      onCreada();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="rounded-otto border border-dashed border-cobre bg-lino px-3.5 py-2.5 text-[14px] font-medium text-cobre">
        + Nueva respuesta
      </button>
    );
  }

  return (
    <div className={TARJETA}>
      <label className={ETIQUETA}>Atajo</label>
      <input value={atajo} onChange={(e) => setAtajo(e.target.value)} placeholder="precios" className={CAMPO} autoFocus />
      <label className={`${ETIQUETA} mt-2.5`}>Texto</label>
      <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} className={CAMPO} />
      <div className="mt-2.5 flex items-center gap-2.5">
        <button type="button" onClick={crear} disabled={enviando || !atajo.trim() || !texto.trim()} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50">
          {enviando ? 'Creando…' : 'Crear'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">
          Cancelar
        </button>
      </div>
      {error && <div className="mt-2 text-[13px] text-ladrillo">{error}</div>}
    </div>
  );
}

export default function RespuestasPage() {
  const { datos, cargando, error, recargar } = useDatos<{ respuestas: Fila[] }>('/api/configuracion/respuestas');

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;
  const lista = datos.respuestas;

  return (
    <>
      {lista.length === 0 ? (
        <div className={TARJETA}>
          <EstadoVacio titulo="Todavía no hay respuestas rápidas" texto="Cargá la primera y el equipo la va a poder insertar escribiendo / en el chat." />
        </div>
      ) : (
        lista.map((r, i) => <RespuestaEditable key={`${r.id}-${r.version}`} fila={r} arriba={lista[i - 1]} abajo={lista[i + 1]} onCambio={recargar} />)
      )}
      <NuevaRespuesta siguienteOrden={(lista.at(-1)?.orden ?? 0) + 1} onCreada={recargar} />
    </>
  );
}
