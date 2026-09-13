'use client';

// Ficha completa de Franco Bertolini (la libreta de Lucía), editable a mano.
// Guardar muestra el Toast con Deshacer; Deshacer descarta lo no guardado.
// Mock: en Fase 2 guarda en clientes con versión e historial (H1.9).

import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';

type Ficha = Record<'evento' | 'fecha' | 'rol' | 'diaNoche' | 'talle' | 'ciudad' | 'color' | 'notas', string>;

const FICHA: Ficha = {
  evento: 'Casamiento',
  fecha: '14/11',
  rol: 'Novio',
  diaNoche: 'Noche',
  talle: '50',
  ciudad: 'Rosario',
  color: 'Azul noche',
  notas: 'Quiere moño, no corbata. La novia eligió paleta terracota.',
};

const CAMPOS: [keyof Ficha, string][] = [
  ['evento', 'Evento'],
  ['fecha', 'Fecha'],
  ['rol', 'Rol'],
  ['diaNoche', 'Día / Noche'],
  ['talle', 'Talle'],
  ['ciudad', 'Ciudad'],
];

const ETIQUETA = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';

const HISTORIAL = [
  ['hoy 09:41', 'Charla con Lucía · confirmó el turno'],
  ['sáb 10:00', 'Turno · Novio · Probador 1 · Confirmado'],
  ['02/09', 'Primera consulta por WhatsApp'],
];

export function FichaEditable() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador(FICHA);
  const { toast, mostrar, cerrar } = useToast();
  const cambiar = (campo: keyof Ficha, texto: string) => setValor({ ...valor, [campo]: texto });

  return (
    <div className="flex w-drawer flex-none flex-col border-l border-borde bg-lino">
      <div className="flex items-baseline gap-2.5 border-b border-borde-suave px-5.5 pb-3.5 pt-5">
        <h2 className="flex-1 font-serif text-xl font-semibold">Franco Bertolini</h2>
        <button type="button" className="text-[14px] text-grafito md:text-xs">
          ✕ cerrar
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5.5 py-4.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {CAMPOS.map(([campo, label]) => (
            <label key={campo} className={ETIQUETA}>
              {label}
              <input value={valor[campo]} onChange={(e) => cambiar(campo, e.target.value)} className={CAMPO} />
            </label>
          ))}
          <label className={`col-span-2 ${ETIQUETA}`}>
            Color preferido
            <input value={valor.color} onChange={(e) => cambiar('color', e.target.value)} className={CAMPO} />
          </label>
          <label className={`col-span-2 ${ETIQUETA}`}>
            Notas
            <textarea
              value={valor.notas}
              onChange={(e) => cambiar('notas', e.target.value)}
              className={`${CAMPO} min-h-[56px] resize-none leading-[1.5]`}
            />
          </label>
        </div>
        <div className="flex items-center gap-2 rounded-otto bg-hueso px-3 py-2.5 text-[14px] text-grafito md:text-[12.5px]">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-pill bg-noche font-serif text-[14px] font-semibold text-hueso md:text-[10px]">
            L
          </span>
          Lucía usa esta ficha en cada mensaje.
        </div>
        <div>
          <div className="mb-2 text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]">Historial</div>
          {HISTORIAL.map(([fecha, texto]) => (
            <div key={fecha} className="flex gap-2 border-t border-borde-suave py-2.5 text-[14px] md:text-[13.5px]">
              <span className="w-[76px] flex-none tabular-nums text-grafito">{fecha}</span>
              {texto}
            </div>
          ))}
        </div>
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
