'use client';

// Configuración › Notas (DISENO.md § 8, PROCESOS.md § 5). Texto libre del dueño
// que Lucía lee como un fragmento más (notas-del-dueno). El texto de ejemplo
// sale de docs/ficha-del-negocio.md § Agenda. Mock hasta Fase 2 (notas_dueno).

import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useBorrador } from '@/components/ui-otto/useBorrador';
import { AccionesEdicion, CAMPO, TARJETA } from '../AccionesEdicion';

const NOTA_INICIAL =
  'Un acompañante por persona en el probador. Hay 10 minutos de tolerancia: si el cliente no puede venir, que avise.';

export default function NotasPage() {
  const { valor, setValor, sucio, guardar, deshacer } = useBorrador(NOTA_INICIAL);
  const { toast, mostrar, cerrar } = useToast();

  return (
    <>
      <div className={TARJETA}>
        <label htmlFor="notas" className="mb-1 block text-[14px] font-medium text-grafito md:text-[13px]">
          Notas del dueño
        </label>
        <div className="mb-2.5 text-[14px] leading-[1.5] text-grafito md:text-[12.5px]">
          Lucía tiene esto en cuenta en cada charla: lo lee como un fragmento más de Conocimiento. Precios y horarios no van
          acá, van en Catálogo y en Agenda.
        </div>
        <textarea
          id="notas"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          rows={10}
          className={`${CAMPO} resize-y leading-[1.6] ${sucio ? 'border-cobre' : ''}`}
        />
      </div>

      <AccionesEdicion
        sucio={sucio}
        onDeshacer={deshacer}
        onGuardar={() => mostrar({ texto: 'Guardado · Lucía lo usa en el próximo mensaje', onAccion: guardar() })}
      />
      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </>
  );
}
