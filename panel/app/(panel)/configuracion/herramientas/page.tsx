'use client';

// Configuración › Herramientas — conectado a GET /api/configuracion (herramientas) y PATCH
// /api/configuracion/herramientas/<id> (H1.8/H1.9, paneles). Nombre, tipo y orden los pone el
// código de agente (AGENTE.md § 4) y no se editan acá: solo la descripción que Lucía lee para
// decidir cuándo usar cada una, y si la puede usar. No hay alta ni baja: las 13 herramientas
// reales ya están seedeadas.

import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { Switch } from '@/components/ui-otto/Switch';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { useEdicion } from '@/components/api/useEdicion';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { useConfiguracion } from '../ConfiguracionContexto';
import type { Configuracion } from '@/lib/queries/configuracion';

type FilaHerramienta = Configuracion['herramientas'][number];
type Editable = Pick<FilaHerramienta, 'version' | 'activa' | 'descripcion'>;

const campos = (h: FilaHerramienta): Editable => ({ version: h.version, activa: h.activa, descripcion: h.descripcion });

const TITULO_TIPO: Record<string, string> = {
  consulta: 'Consulta · no tocan el mundo',
  accion: 'Acción · el código valida antes de ejecutar',
};

function HerramientaEditable({ herramienta, onCambio }: { herramienta: FilaHerramienta; onCambio: () => void }) {
  const edicion = useEdicion(campos(herramienta));
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);

  async function guardarDescripcion() {
    const err = await edicion.guardar(`/api/configuracion/herramientas/${herramienta.id}`, { descripcion: edicion.valor.descripcion });
    if (err) mostrar(err, true);
    else mostrar('Guardado', false);
  }

  async function cambiarActiva(activa: boolean) {
    const err = await edicion.guardar(`/api/configuracion/herramientas/${herramienta.id}`, { activa });
    if (err) mostrar(err, true);
  }

  return (
    <div className={`rounded-otto border border-borde p-3.5 md:p-4 ${edicion.valor.activa ? 'bg-lino' : 'bg-[#FBFAF7]'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`min-w-0 break-all font-mono text-[14px] font-semibold md:text-[13.5px] ${edicion.valor.activa ? '' : 'text-grafito'}`}>{herramienta.nombre}</span>
        <Chip estado={herramienta.tipo === 'consulta' ? 'Lucía' : 'Persona'}>{herramienta.tipo === 'consulta' ? 'Consulta' : 'Acción'}</Chip>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-medium text-grafito md:text-xs">
          {edicion.valor.activa ? 'Activa' : 'Apagada'}
          <Switch checked={edicion.valor.activa} ariaLabel={`${herramienta.nombre} activa`} onChange={cambiarActiva} />
        </span>
      </div>
      <textarea
        value={edicion.valor.descripcion}
        onChange={(e) => edicion.setValor({ ...edicion.valor, descripcion: e.target.value })}
        rows={2}
        aria-label={`Descripción de ${herramienta.nombre}`}
        className="w-full resize-y rounded-otto border border-borde bg-lino px-3 py-2 text-[14.5px] leading-[1.5] outline-none focus:border-cobre"
      />
      {toast}
      <div className="mt-1.5 flex items-center gap-2.5">
        {edicion.sucio && (
          <button type="button" onClick={guardarDescripcion} disabled={edicion.guardando} className="rounded-otto bg-cobre px-3.5 py-1.5 text-[14px] font-medium text-lino disabled:opacity-50">
            {edicion.guardando ? 'Guardando…' : 'Guardar descripción'}
          </button>
        )}
        <button type="button" onClick={() => setHistorial(true)} className="text-[14px] text-tinta underline-offset-2 hover:underline md:text-xs">
          Ver versión anterior
        </button>
      </div>
      {historial && <PanelHistorial tabla="herramientas_agente" id={herramienta.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onCambio} />}
    </div>
  );
}

export default function HerramientasPage() {
  const { datos, cargando, error, recargar } = useConfiguracion();

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  const tipos = [...new Set(datos.herramientas.map((h) => h.tipo))];

  return (
    <>
      <div className="flex items-start gap-2.5 rounded-otto bg-hueso px-3.5 py-3 text-[14px] leading-[1.5] text-grafito md:text-[13.5px]">
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-pill bg-noche font-serif text-[14px] font-semibold text-hueso md:text-[11px]">L</span>
        <span>
          <span className="font-medium text-tinta">Lo que la herramienta hace no se edita acá.</span> Acá cambiás la descripción que Lucía lee para decidir
          cuándo usarla, y si la puede usar.
        </span>
      </div>

      {tipos.map((tipo) => (
        <section key={tipo} className="flex flex-col gap-2.5">
          <h2 className="mt-1 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">{TITULO_TIPO[tipo] ?? tipo}</h2>
          {datos.herramientas
            .filter((h) => h.tipo === tipo)
            .map((h) => (
              <HerramientaEditable key={`${h.id}-${h.version}`} herramienta={h} onCambio={recargar} />
            ))}
        </section>
      ))}
    </>
  );
}
