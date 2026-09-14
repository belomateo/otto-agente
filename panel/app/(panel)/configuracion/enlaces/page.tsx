'use client';

// Configuración › Enlaces (DISENO.md § 8). Web, mapa, reseña de Google y
// turnero, editables. Los valores salen de docs/ficha-del-negocio.md § Enlaces;
// el de reseñas no está en la ficha y queda pendiente de carga. Mock hasta Fase 2.

import { Chip } from '@/components/ui-otto/Chip';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';
import { AccionesEdicion, CAMPO, TARJETA } from '../AccionesEdicion';

type Enlace = { clave: string; label: string; valor: string; ayuda: string };

const ENLACES: Enlace[] = [
  { clave: 'web', label: 'Web', valor: 'https://www.mrotto.com.ar/', ayuda: 'Lucía la manda cuando el cliente quiere ver más.' },
  { clave: 'mapa', label: 'Mapa', valor: 'https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8', ayuda: 'España 764, Rosario. Va en la confirmación de cada turno.' },
  {
    clave: 'resena',
    label: 'Reseña de Google',
    valor: '',
    ayuda: 'Lo usa el agradecimiento después de la devolución. No está en la ficha del negocio: falta cargarlo.',
  },
  { clave: 'turnero', label: 'Turnero', valor: 'https://app3.doyturnos.com/ottoalquiler', ayuda: 'El turnero que se usa hoy (doyturnos).' },
];

export default function EnlacesPage() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador(ENLACES);
  const { toast, mostrar, cerrar } = useToast();

  return (
    <>
      {valor.map((e) => (
        <div key={e.clave} className={TARJETA}>
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor={`enlace-${e.clave}`} className="flex-1 text-[14px] font-medium text-grafito md:text-[13px]">
              {e.label}
            </label>
            {!e.valor.trim() && <Chip estado="Sin confirmar">Falta cargar</Chip>}
          </div>
          <input
            id={`enlace-${e.clave}`}
            type="url"
            inputMode="url"
            value={e.valor}
            placeholder="https://…"
            onChange={(ev) => setValor(valor.map((x) => (x.clave === e.clave ? { ...x, valor: ev.target.value } : x)))}
            className={`${CAMPO} min-w-0`}
          />
          <div className="mt-1.5 text-[14px] leading-[1.5] text-grafito md:text-[12.5px]">{e.ayuda}</div>
        </div>
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
