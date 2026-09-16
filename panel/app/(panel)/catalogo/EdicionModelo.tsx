'use client';

// Panel de edición del modelo abierto — conectado a PATCH /api/catalogo/modelos/<id> (H1.9,
// paneles, solo admin). Precio, talles, descripción y el switch se editan de verdad. Fotos
// (arrastrar/subir) y colores (agregar/sacar) todavía no tienen una interfaz acá: se ven tal
// como están cargados, sin editor — son ediciones más grandes que el resto de esta tanda.

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui-otto/Switch';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useEdicion } from '@/components/api/useEdicion';
import { FotoPlaceholder } from './page';
import type { Fila } from '@/lib/queries/comun';
import type { FilaModelo } from '@/lib/queries/catalogo';

// Un link roto (foto borrada del storage, URL vieja) muestra el ícono roto del navegador si no
// se hace nada: onError pasa al mismo placeholder que usa la grilla.
function Miniatura({ url }: { url: string }) {
  const [rota, setRota] = useState(false);
  useEffect(() => setRota(false), [url]);
  if (rota) {
    return (
      <div className="h-[74px] w-14 flex-none overflow-hidden rounded-[6px] border border-borde">
        <FotoPlaceholder texto="" chico />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-[74px] w-14 flex-none rounded-[6px] border border-borde object-cover" onError={() => setRota(true)} />;
}

// La fila cruda que devuelve PATCH /api/catalogo/modelos/<id> es la tabla tal cual
// (catalogo_alquiler: columna `talles`), no la forma ya transformada de FilaModelo
// (`talles_lista`) que arma la consulta de lectura.
type ModeloCrudo = Fila<'catalogo_alquiler'>;

const SIN_CONECTAR = 'Todavía no conectado';
const ETIQUETA = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';
const RAYADO = 'repeating-linear-gradient(45deg,#EFEBE3 0 8px,#F5F1EA 8px 16px)';

// FilaModelo (la forma de lectura, compatible con el mock) dice `on`/`off`, no `activo`: ese
// es el nombre real de la columna, que solo se ve tal cual en la fila que devuelve el PATCH.
type Editable = Pick<FilaModelo, 'version' | 'precio_base' | 'descripcion'> & { activo: boolean; talles_texto: string };

function Interior({ modelo, onGuardado, onCerrar }: { modelo: FilaModelo; onGuardado: () => void; onCerrar: () => void }) {
  const edicion = useEdicion<Editable>({
    version: modelo.version,
    precio_base: modelo.precio_base,
    descripcion: modelo.descripcion,
    activo: modelo.on,
    talles_texto: modelo.talles_lista.join(', '),
  });
  const { toast, mostrar, cerrar } = useToast();
  const [historialAbierto, setHistorialAbierto] = useState(false);

  async function guardar() {
    const talles = edicion.valor.talles_texto
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const err = await edicion.guardar(
      `/api/catalogo/modelos/${modelo.id}`,
      { precio_base: edicion.valor.precio_base, descripcion: edicion.valor.descripcion, activo: edicion.valor.activo, talles },
      (filaCruda) => {
        const f = filaCruda as ModeloCrudo;
        return { version: f.version, precio_base: f.precio_base, descripcion: f.descripcion, activo: f.activo, talles_texto: f.talles.join(', ') };
      },
    );
    if (err) mostrar({ variante: 'error', texto: err, accion: 'Cerrar' });
    else {
      mostrar({ texto: 'Guardado · Lucía lo usa en el próximo mensaje', accion: 'Cerrar' });
      onGuardado();
    }
  }

  return (
    <div className="flex w-[380px] flex-none flex-col border-l border-borde bg-lino">
      <div className="flex items-baseline gap-2.5 border-b border-borde-suave px-5.5 pb-3.5 pt-5">
        <h2 className="flex-1 truncate font-serif text-[19px] font-semibold">{modelo.modelo}</h2>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-[14px] text-grafito md:text-xs">
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5.5 py-4.5">
        {modelo.fotos.length > 0 ? (
          <div className="flex gap-2">
            {modelo.fotos.map((f) => (
              <Miniatura key={f} url={f} />
            ))}
          </div>
        ) : (
          <div className="rounded-otto border-[1.5px] border-dashed border-[#C9C4B9] bg-[#FBFAF7] p-4.5 text-center text-[14px] leading-[1.5] text-grafito md:text-[13px]" title={SIN_CONECTAR}>
            Sin fotos cargadas
            <br />
            <span className="text-[14px] text-[#8A8578] md:text-xs">Subir fotos: {SIN_CONECTAR.toLowerCase()}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <label className={ETIQUETA}>
            Precio base
            <input
              inputMode="numeric"
              value={edicion.valor.precio_base}
              onChange={(e) => edicion.setValor({ ...edicion.valor, precio_base: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              className={`${CAMPO} tabular-nums`}
            />
          </label>
          <label className={ETIQUETA}>
            Talles (separados por coma)
            <input value={edicion.valor.talles_texto} onChange={(e) => edicion.setValor({ ...edicion.valor, talles_texto: e.target.value })} className={CAMPO} />
          </label>
        </div>
        <div>
          <div className="mb-1.5 text-[14px] font-medium text-grafito md:text-[11.5px]">Colores</div>
          <div className="flex items-center gap-2">
            {modelo.colores.map((c) => (
              <span key={c.nombre} title={c.nombre} className="h-[22px] w-[22px] rounded-pill border border-borde" style={{ background: c.hex ?? '#C9C4B9' }} />
            ))}
            <span
              title={`Agregar o sacar colores: ${SIN_CONECTAR.toLowerCase()}`}
              className="flex h-[22px] w-[22px] cursor-not-allowed items-center justify-center rounded-pill border-[1.5px] border-dashed border-[#C9C4B9] text-[14px] text-[#8A8578] md:text-[13px]"
            >
              +
            </span>
          </div>
        </div>
        <label className={ETIQUETA}>
          Descripción corta (la lee Lucía)
          <textarea
            value={edicion.valor.descripcion ?? ''}
            onChange={(e) => edicion.setValor({ ...edicion.valor, descripcion: e.target.value || null })}
            className={`${CAMPO} min-h-16 resize-none leading-[1.5]`}
          />
        </label>
        <Switch label="Lucía lo puede mostrar" checked={edicion.valor.activo} onChange={(activo) => edicion.setValor({ ...edicion.valor, activo })} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-borde-suave px-5.5 py-3.5">
        <button type="button" onClick={guardar} disabled={edicion.guardando} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-60">
          {edicion.guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={edicion.deshacer} disabled={!edicion.sucio || edicion.guardando} className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito disabled:opacity-50">
          Deshacer
        </button>
        <button type="button" onClick={() => setHistorialAbierto(true)} className="ml-auto text-[14px] underline-offset-2 hover:underline md:text-[13px]">
          Ver versión anterior
        </button>
        {edicion.sucio && <div className="basis-full text-[14px] text-cobre md:text-xs">Hay cambios sin guardar</div>}
      </div>
      <ToastFlotante toast={toast} onCerrar={cerrar} />
      {historialAbierto && <PanelHistorial tabla="modelos" id={modelo.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorialAbierto(false)} onRestaurado={onGuardado} />}
    </div>
  );
}

export function EdicionModelo({ modelo, onGuardado, onCerrar }: { modelo: FilaModelo; onGuardado: () => void; onCerrar: () => void }) {
  // key con la versión: si se restaura o se guarda y el padre recarga la lista, el editor
  // arranca de nuevo con los datos frescos como base (useEdicion solo toma su inicial al montarse).
  return <Interior key={`${modelo.id}-${modelo.version}`} modelo={modelo} onGuardado={onGuardado} onCerrar={onCerrar} />;
}
