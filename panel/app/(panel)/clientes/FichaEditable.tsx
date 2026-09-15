'use client';

// Ficha completa (la libreta de Lucía), editable a mano — conectada a GET /api/clientes/<id>
// y PATCH /api/clientes/<id> (H1.8 y H1.9, paneles). Guardar muestra el Toast; si otra persona
// editó la misma ficha mientras tanto, el servidor lo dice (409) y acá no se pisa nada. «Ver
// versión anterior» trae el historial real y puede restaurar cualquier versión.

import { useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { useDatos } from '@/components/api/useDatos';
import { useEdicion } from '@/components/api/useEdicion';
import { ETIQUETA_DIA_O_NOCHE, ETIQUETA_EVENTO, ETIQUETA_ROL } from '@/lib/etiquetas';
import type { FichaDeCliente } from '@/lib/queries/clientes';

const ETIQUETA_CAMPO = 'flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]';
const CAMPO = 'w-full rounded-otto border border-borde bg-lino px-2.5 py-2 text-sm text-tinta outline-none focus:border-cobre';

// Las columnas que de verdad se pueden editar (lib/edicion/entidades.ts, ENTIDADES.clientes):
// el teléfono es la identidad del cliente en WhatsApp y no se toca desde acá.
type Editables = Pick<
  FichaDeCliente['cliente'],
  'nombre' | 'email' | 'evento' | 'fecha_evento' | 'rol' | 'dia_o_noche' | 'talle_aprox' | 'ciudad' | 'color_preferido' | 'presupuesto_mencionado' | 'notas_libres'
>;

function campos(c: FichaDeCliente['cliente']): Editables & { version: number } {
  return {
    version: c.version,
    nombre: c.nombre,
    email: c.email,
    evento: c.evento,
    fecha_evento: c.fecha_evento,
    rol: c.rol,
    dia_o_noche: c.dia_o_noche,
    talle_aprox: c.talle_aprox,
    ciudad: c.ciudad,
    color_preferido: c.color_preferido,
    presupuesto_mencionado: c.presupuesto_mencionado,
    notas_libres: c.notas_libres,
  };
}

function Campo({ label, colSpan = false, ...props }: { label: string; colSpan?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`${colSpan ? 'col-span-2' : ''} ${ETIQUETA_CAMPO}`}>
      {label}
      <input {...props} className={CAMPO} />
    </label>
  );
}

function Select({ label, opciones, value, onChange }: { label: string; opciones: Record<string, string>; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className={ETIQUETA_CAMPO}>
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={CAMPO}>
        <option value="">—</option>
        {Object.entries(opciones).map(([clave, texto]) => (
          <option key={clave} value={clave}>
            {texto}
          </option>
        ))}
      </select>
    </label>
  );
}

function Interior({ ficha, onRecargar }: { ficha: FichaDeCliente; onRecargar: () => void }) {
  const edicion = useEdicion(campos(ficha.cliente));
  const { toast, mostrar, cerrar } = useToast();
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const cambiar = <K extends keyof Editables>(campo: K, texto: Editables[K]) => edicion.setValor({ ...edicion.valor, [campo]: texto });

  async function guardar() {
    const err = await edicion.guardar(`/api/clientes/${ficha.cliente.id}`, edicion.valor);
    if (err) mostrar({ variante: 'error', texto: err, accion: 'Cerrar' });
    else mostrar({ texto: 'Guardado · Lucía lo usa en el próximo mensaje', accion: 'Cerrar' });
  }

  return (
    <div className="flex w-drawer flex-none flex-col border-l border-borde bg-lino">
      <div className="flex items-baseline gap-2.5 border-b border-borde-suave px-5.5 pb-3.5 pt-5">
        <h2 className="flex-1 truncate font-serif text-xl font-semibold">{ficha.datos.nombre}</h2>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5.5 py-4.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Campo label="Nombre" colSpan value={edicion.valor.nombre ?? ''} onChange={(e) => cambiar('nombre', e.target.value || null)} />
          <Campo label="Email" colSpan type="email" value={edicion.valor.email ?? ''} onChange={(e) => cambiar('email', e.target.value || null)} />
          <Select label="Evento" opciones={ETIQUETA_EVENTO} value={edicion.valor.evento} onChange={(v) => cambiar('evento', v)} />
          <Campo label="Fecha (AAAA-MM-DD)" value={edicion.valor.fecha_evento ?? ''} onChange={(e) => cambiar('fecha_evento', e.target.value || null)} />
          <Select label="Rol" opciones={ETIQUETA_ROL} value={edicion.valor.rol} onChange={(v) => cambiar('rol', v)} />
          <Select label="Día / Noche" opciones={ETIQUETA_DIA_O_NOCHE} value={edicion.valor.dia_o_noche} onChange={(v) => cambiar('dia_o_noche', v)} />
          <Campo label="Talle" value={edicion.valor.talle_aprox ?? ''} onChange={(e) => cambiar('talle_aprox', e.target.value || null)} />
          <Campo label="Ciudad" value={edicion.valor.ciudad ?? ''} onChange={(e) => cambiar('ciudad', e.target.value || null)} />
          <Campo label="Color preferido" colSpan value={edicion.valor.color_preferido ?? ''} onChange={(e) => cambiar('color_preferido', e.target.value || null)} />
          <Campo label="Presupuesto mencionado" colSpan value={edicion.valor.presupuesto_mencionado ?? ''} onChange={(e) => cambiar('presupuesto_mencionado', e.target.value || null)} />
          <label className={`col-span-2 ${ETIQUETA_CAMPO}`}>
            Notas
            <textarea
              value={edicion.valor.notas_libres ?? ''}
              onChange={(e) => cambiar('notas_libres', e.target.value || null)}
              className={`${CAMPO} min-h-[56px] resize-none leading-[1.5]`}
            />
          </label>
        </div>
        <div className="flex items-center gap-2 rounded-otto bg-hueso px-3 py-2.5 text-[14px] text-grafito md:text-[12.5px]">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-pill bg-noche font-serif text-[14px] font-semibold text-hueso md:text-[10px]">L</span>
          Lucía usa esta ficha en cada mensaje.
        </div>
        {ficha.turnos.length > 0 && (
          <div>
            <div className="mb-2 text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]">Turnos</div>
            {ficha.turnos.map((t) => (
              <div key={t.id} className="flex gap-2 border-t border-borde-suave py-2.5 text-[14px] md:text-[13.5px]">
                <span className="w-[92px] flex-none tabular-nums text-grafito">{t.cuando}</span>
                {t.texto}
              </div>
            ))}
          </div>
        )}
        <div>
          <div className="mb-2 text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]">Historial</div>
          {ficha.historial.length === 0 ? (
            <div className="text-[14px] text-grafito">Todavía no hay actividad.</div>
          ) : (
            ficha.historial.map((h, i) => (
              <div key={i} className="flex gap-2 border-t border-borde-suave py-2.5 text-[14px] md:text-[13.5px]">
                <span className="w-[76px] flex-none tabular-nums text-grafito">{h.fecha}</span>
                {h.texto}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-borde-suave px-5.5 py-3.5">
        <button type="button" onClick={guardar} disabled={edicion.guardando} className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-60">
          {edicion.guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={edicion.deshacer}
          disabled={!edicion.sucio || edicion.guardando}
          className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito disabled:opacity-50"
        >
          Deshacer
        </button>
        <button type="button" onClick={() => setHistorialAbierto(true)} className="ml-auto text-[14px] underline-offset-2 hover:underline md:text-[13px]">
          Ver versión anterior
        </button>
        {edicion.sucio && <div className="basis-full text-[14px] text-cobre md:text-xs">Hay cambios sin guardar</div>}
      </div>
      <ToastFlotante toast={toast} onCerrar={cerrar} />
      {historialAbierto && (
        <PanelHistorial tabla="clientes" id={ficha.cliente.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorialAbierto(false)} onRestaurado={onRecargar} />
      )}
    </div>
  );
}

export function FichaEditable({ id }: { id: string }) {
  const { datos: ficha, cargando, error, recargar } = useDatos<FichaDeCliente>(`/api/clientes/${id}`);

  if (cargando && !ficha) {
    return (
      <div className="w-drawer flex-none border-l border-borde bg-lino">
        <Cargando />
      </div>
    );
  }
  if (error) {
    return (
      <div className="w-drawer flex-none border-l border-borde bg-lino">
        <EstadoError mensaje={error} onReintentar={recargar} />
      </div>
    );
  }
  if (!ficha) return null;
  // key con la versión: si se restaura o alguien más edita y se recarga, el editor arranca de
  // nuevo con los datos frescos como base (useEdicion solo toma su valor inicial al montarse).
  return <Interior key={`${ficha.cliente.id}-${ficha.cliente.version}`} ficha={ficha} onRecargar={recargar} />;
}
