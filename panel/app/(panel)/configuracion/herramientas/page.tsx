'use client';

// Configuración › Herramientas (DISENO.md § 8, PROCESOS.md § 5). Nombre,
// descripción editable (lo que Lucía lee) y switch. El schema y las
// precondiciones no se editan acá. Mock hasta Fase 2.

import { Chip } from '@/components/ui-otto/Chip';
import { Switch } from '@/components/ui-otto/Switch';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';
import { AccionesEdicion } from '../AccionesEdicion';
import { HERRAMIENTAS, type Herramienta } from './herramientas-mock';

const GRUPOS: { tipo: Herramienta['tipo']; titulo: string }[] = [
  { tipo: 'consulta', titulo: 'Consulta · no tocan el mundo' },
  { tipo: 'accion', titulo: 'Acción · el código valida antes de ejecutar' },
];

export default function HerramientasPage() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador(HERRAMIENTAS);
  const { toast, mostrar, cerrar } = useToast();

  const cambiar = (nombre: string, cambio: Partial<Herramienta>) =>
    setValor(valor.map((h) => (h.nombre === nombre ? { ...h, ...cambio } : h)));

  return (
    <>
      <div className="flex items-start gap-2.5 rounded-otto bg-hueso px-3.5 py-3 text-[14px] leading-[1.5] text-grafito md:text-[13.5px]">
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-pill bg-noche font-serif text-[14px] font-semibold text-hueso md:text-[11px]">
          L
        </span>
        <span>
          <span className="font-medium text-tinta">Lo que la herramienta hace no se edita acá.</span> Acá cambiás la descripción
          que Lucía lee para decidir cuándo usarla, y si la puede usar.
        </span>
      </div>

      {GRUPOS.map((g) => (
        <section key={g.tipo} className="flex flex-col gap-2.5">
          <h2 className="mt-1 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">{g.titulo}</h2>
          {valor
            .filter((h) => h.tipo === g.tipo)
            .map((h) => (
              <div key={h.nombre} className={`rounded-otto border border-borde p-3.5 md:p-4 ${h.activa ? 'bg-lino' : 'bg-[#FBFAF7]'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`min-w-0 break-all font-mono text-[14px] font-semibold md:text-[13.5px] ${h.activa ? '' : 'text-grafito'}`}>
                    {h.nombre}
                  </span>
                  <Chip estado={h.tipo === 'consulta' ? 'Lucía' : 'Persona'}>{h.tipo === 'consulta' ? 'Consulta' : 'Acción'}</Chip>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-medium text-grafito md:text-xs">
                    {h.activa ? 'Activa' : 'Apagada'}
                    <Switch checked={h.activa} ariaLabel={`${h.nombre} activa`} onChange={(activa) => cambiar(h.nombre, { activa })} />
                  </span>
                </div>
                <textarea
                  value={h.descripcion}
                  onChange={(e) => cambiar(h.nombre, { descripcion: e.target.value })}
                  rows={2}
                  aria-label={`Descripción de ${h.nombre}`}
                  className="w-full resize-y rounded-otto border border-borde bg-lino px-3 py-2 text-[14.5px] leading-[1.5] outline-none focus:border-cobre"
                />
              </div>
            ))}
        </section>
      ))}

      <AccionesEdicion
        sucio={sucio}
        onDeshacer={deshacer}
        onGuardar={() => mostrar({ texto: 'Guardado · Lucía lo usa en el próximo mensaje', onAccion: guardar() })}
      />
      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </>
  );
}
