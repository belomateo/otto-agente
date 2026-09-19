// Bitácora › Propuestas (PROCESOS.md § 6): lo que el analista nocturno sugiere agregar o
// corregir, para que el dueño o Mateo decidan — nunca se aplica solo. Ese analista todavía no
// existe (no hay tabla `propuestas_mejora` ni ruta en paneles): mientras tanto, en vez de
// simular una lista con datos inventados, la pantalla dice la verdad.

import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';

export default function PropuestasPage() {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6 md:pt-5">
      <div className="rounded-otto border border-borde bg-lino">
        <EstadoVacio
          titulo="Todavía no existe el analista nocturno"
          texto="Lo que sugiera para agregar o corregir (PROCESOS.md § 6) va a aparecer acá cuando esté construido. Por ahora no hay nada real que mostrar."
        />
      </div>
    </div>
  );
}
