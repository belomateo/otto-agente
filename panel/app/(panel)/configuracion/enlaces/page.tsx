'use client';

// Configuración › Enlaces — conectado a GET /api/configuracion (enlaces) y POST/PATCH
// /api/configuracion/enlaces (H1.8/H1.9, paneles). No hay una clave fija (web/mapa/reseña…
// era del mock): la lista es la real de la tabla `enlaces`, cada una con su nombre y su URL.
// No se borran desde el panel (la entidad no es `borrable`): "Activo" en false es cómo se
// deja de usar un link sin perder su historial.

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

type FilaEnlace = Configuracion['enlaces'][number];
type Editable = Pick<FilaEnlace, 'version' | 'nombre' | 'url' | 'activo'>;

const campos = (e: FilaEnlace): Editable => ({ version: e.version, nombre: e.nombre, url: e.url, activo: e.activo });

function EnlaceEditable({ enlace, onGuardado }: { enlace: FilaEnlace; onGuardado: () => void }) {
  const edicion = useEdicion(campos(enlace));
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/enlaces/${enlace.id}`, edicion.valor);
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onGuardado();
    }
  }

  return (
    <div className={TARJETA}>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">Nombre</label>
        <label className="flex items-center gap-1.5 text-[14px] text-grafito md:text-xs">
          <input type="checkbox" checked={edicion.valor.activo} onChange={(e) => edicion.setValor({ ...edicion.valor, activo: e.target.checked })} />
          Activo
        </label>
      </div>
      <input value={edicion.valor.nombre} onChange={(e) => edicion.setValor({ ...edicion.valor, nombre: e.target.value })} className={CAMPO} />
      <label className={`${ETIQUETA} mt-2.5`}>URL</label>
      <input
        type="url"
        inputMode="url"
        placeholder="https://…"
        value={edicion.valor.url}
        onChange={(e) => edicion.setValor({ ...edicion.valor, url: e.target.value })}
        className={CAMPO}
      />
      {toast}
      <AccionesEdicion sucio={edicion.sucio} guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} onVerHistorial={() => setHistorial(true)} />
      {historial && <PanelHistorial tabla="enlaces" id={enlace.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onGuardado} />}
    </div>
  );
}

function NuevoEnlace({ onCreado }: { onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/enlaces', 'POST', { nombre, url, activo: true });
      setNombre('');
      setUrl('');
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
        + Nuevo enlace
      </button>
    );
  }

  return (
    <div className={TARJETA}>
      <label className={ETIQUETA}>Nombre</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} autoFocus />
      <label className={`${ETIQUETA} mt-2.5`}>URL</label>
      <input type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className={CAMPO} />
      <div className="mt-2.5 flex items-center gap-2.5">
        <button type="button" onClick={crear} disabled={enviando || !nombre.trim() || !url.trim()} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50">
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

export default function EnlacesPage() {
  const { datos, cargando, error, recargar } = useConfiguracion();

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  return (
    <>
      {datos.enlaces.length === 0 ? (
        <div className={TARJETA}>
          <EstadoVacio titulo="Todavía no hay enlaces" texto="Cargá el primero para que Lucía lo pueda mandar." />
        </div>
      ) : (
        datos.enlaces.map((e) => <EnlaceEditable key={`${e.id}-${e.version}`} enlace={e} onGuardado={recargar} />)
      )}
      <NuevoEnlace onCreado={recargar} />
    </>
  );
}
