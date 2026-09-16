'use client';

// Configuración › Notas — conectado a GET /api/configuracion (notas) y POST/PATCH
// /api/configuracion/notas (H1.8/H1.9, paneles). Texto libre del dueño que Lucía lee como un
// fragmento más de Conocimiento (PROCESOS.md § 5); precios y horarios van en Catálogo y
// Agenda, no acá. `notas_dueno` no tiene ninguna fila cargada todavía: por eso hace falta el
// formulario de "Nueva nota", no solo editar lo que ya existe.

import { useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useEdicion } from '@/components/api/useEdicion';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { AccionesEdicion, CAMPO, ETIQUETA, TARJETA } from '../AccionesEdicion';
import { useConfiguracion } from '../ConfiguracionContexto';
import type { Configuracion } from '@/lib/queries/configuracion';

type FilaNota = Configuracion['notas'][number];
type Editable = Pick<FilaNota, 'version' | 'titulo' | 'texto' | 'activo'>;

const campos = (n: FilaNota): Editable => ({ version: n.version, titulo: n.titulo, texto: n.texto, activo: n.activo });

function NotaEditable({ nota, onGuardado }: { nota: FilaNota; onGuardado: () => void }) {
  const edicion = useEdicion(campos(nota));
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/notas/${nota.id}`, edicion.valor);
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onGuardado();
    }
  }

  return (
    <div className={TARJETA}>
      <div className="mb-2 flex items-center gap-2">
        <input
          value={edicion.valor.titulo ?? ''}
          onChange={(e) => edicion.setValor({ ...edicion.valor, titulo: e.target.value || null })}
          placeholder="Sin título"
          className="flex-1 border-b border-transparent bg-transparent text-[14px] font-medium text-grafito outline-none focus:border-cobre md:text-[13px]"
        />
        <label className="flex items-center gap-1.5 text-[14px] text-grafito md:text-xs">
          <input type="checkbox" checked={edicion.valor.activo} onChange={(e) => edicion.setValor({ ...edicion.valor, activo: e.target.checked })} />
          Activa
        </label>
      </div>
      <textarea
        value={edicion.valor.texto}
        onChange={(e) => edicion.setValor({ ...edicion.valor, texto: e.target.value })}
        rows={6}
        className={`${CAMPO} resize-y leading-[1.6]`}
      />
      {toast}
      <AccionesEdicion sucio={edicion.sucio} guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} onVerHistorial={() => setHistorial(true)} />
      {historial && <PanelHistorial tabla="notas_dueno" id={nota.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onGuardado} />}
    </div>
  );
}

function NuevaNota({ onCreado }: { onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/notas', 'POST', { titulo: titulo || null, texto, activo: true });
      setTitulo('');
      setTexto('');
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
      <button type="button" onClick={() => setAbierto(true)} className="rounded-otto border border-dashed border-cobre bg-lino px-3.5 py-2.5 text-[14px] font-medium text-cobre">
        + Nueva nota
      </button>
    );
  }

  return (
    <div className={TARJETA}>
      <label className={ETIQUETA}>Título (opcional)</label>
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={CAMPO} autoFocus />
      <label className={`${ETIQUETA} mt-2.5`}>Texto</label>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className={`${CAMPO} resize-y leading-[1.6]`} />
      <div className="mt-2.5 flex items-center gap-2.5">
        <button type="button" onClick={crear} disabled={enviando || !texto.trim()} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50">
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

export default function NotasPage() {
  const { datos, cargando, error, recargar } = useConfiguracion();

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  return (
    <>
      {datos.notas.length === 0 ? (
        <div className={TARJETA}>
          <EstadoVacio titulo="Todavía no hay notas" texto="Lucía las lee como un fragmento más de Conocimiento." />
        </div>
      ) : (
        datos.notas.map((n) => <NotaEditable key={`${n.id}-${n.version}`} nota={n} onGuardado={recargar} />)
      )}
      <NuevaNota onCreado={recargar} />
    </>
  );
}
