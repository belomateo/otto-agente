'use client';

// Panel de edición del modelo abierto (Ambo azul noche). Fotos y colores son
// el molde visual; precio, talles, descripción y el switch se editan y
// Guardar muestra el Toast con Deshacer. Mock: en Fase 2 es catalogo_alquiler.

import { Switch } from '@/components/ui-otto/Switch';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';

const MODELO = {
  precio: '$150.000',
  talles: '44 a 60',
  descripcion: 'Corte italiano entallado, solapa en punta. El clásico para casamientos de noche.',
  muestra: true,
};

const ETIQUETA = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';
const RAYADO = 'repeating-linear-gradient(45deg,#EFEBE3 0 8px,#F5F1EA 8px 16px)';

export function EdicionModelo() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador(MODELO);
  const { toast, mostrar, cerrar } = useToast();

  return (
    <div className="flex w-[380px] flex-none flex-col border-l border-borde bg-lino">
      <div className="flex items-baseline gap-2.5 border-b border-borde-suave px-5.5 pb-3.5 pt-5">
        <h2 className="flex-1 font-serif text-[19px] font-semibold">Ambo azul noche corte italiano</h2>
        <button type="button" aria-label="Cerrar" className="text-[14px] text-grafito md:text-xs">
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5.5 py-4.5">
        <div className="rounded-otto border-[1.5px] border-dashed border-[#C9C4B9] bg-[#FBFAF7] p-4.5 text-center text-[14px] leading-[1.5] text-grafito md:text-[13px]">
          Arrastrá fotos acá
          <br />
          <span className="text-[14px] text-[#8A8578] md:text-xs">o pegá un link de imagen</span>
        </div>
        <div className="flex gap-2">
          <div className="h-[74px] w-14 rounded-[6px] border border-borde" style={{ background: RAYADO }} />
          <div className="h-[74px] w-14 rounded-[6px] border border-borde" style={{ background: RAYADO }} />
          <div className="flex h-[74px] w-14 items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-[#C9C4B9] text-base text-[#8A8578]">
            +
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <label className={ETIQUETA}>
            Precio base
            <input value={valor.precio} onChange={(e) => setValor({ ...valor, precio: e.target.value })} className={`${CAMPO} tabular-nums`} />
          </label>
          <label className={ETIQUETA}>
            Talles
            <input value={valor.talles} onChange={(e) => setValor({ ...valor, talles: e.target.value })} className={CAMPO} />
          </label>
        </div>
        <div>
          <div className="mb-1.5 text-[14px] font-medium text-grafito md:text-[11.5px]">Colores</div>
          <div className="flex items-center gap-2">
            <span className="h-[22px] w-[22px] rounded-pill border-2 border-cobre" style={{ background: '#1F2A3C' }} />
            <span className="h-[22px] w-[22px] rounded-pill border border-borde" style={{ background: '#2E3D55' }} />
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-pill border-[1.5px] border-dashed border-[#C9C4B9] text-[14px] text-[#8A8578] md:text-[13px]">
              +
            </span>
          </div>
        </div>
        <label className={ETIQUETA}>
          Descripción corta (la lee Lucía)
          <textarea
            value={valor.descripcion}
            onChange={(e) => setValor({ ...valor, descripcion: e.target.value })}
            className={`${CAMPO} min-h-16 resize-none leading-[1.5]`}
          />
        </label>
        <Switch label="Lucía lo puede mostrar" checked={valor.muestra} onChange={(muestra) => setValor({ ...valor, muestra })} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-borde-suave px-5.5 py-3.5">
        <button
          type="button"
          onClick={() => mostrar({ texto: 'Guardado · Lucía lo usa en el próximo mensaje', onAccion: guardar() })}
          className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={deshacer}
          disabled={!sucio}
          className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito disabled:opacity-50"
        >
          Deshacer
        </button>
        <button type="button" className="ml-auto text-[14px] md:text-[13px]">
          Ver versión anterior
        </button>
        {sucio && <div className="basis-full text-[14px] text-cobre md:text-xs">Hay cambios sin guardar</div>}
      </div>
      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </div>
  );
}
