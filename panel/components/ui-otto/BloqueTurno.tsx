// Bloque de turno — siete estados más el aviso. Ver DISENO.md § componentes, 5.
// El ciclo real es Sin confirmar → Confirmado → Alquiló → Retiró → Devolvió;
// Cancelado y No vino lo cortan (decisión #2 de Mateo, 12/9: se guardan como
// estado, no se borra la fila). El aviso ("sin sincronizar con Google Calendar")
// NO es un estado: viene en una columna aparte y se muestra además del estado,
// nunca en su lugar, así un turno con problema de sync no pierde su estado real.

export type EstadoTurno =
  | 'sin-confirmar'
  | 'confirmado'
  | 'alquilo'
  | 'retiro'
  | 'devolvio'
  | 'cancelado'
  | 'no-vino';

export const ETIQUETA_ESTADO: Record<EstadoTurno, string> = {
  'sin-confirmar': 'Sin confirmar',
  confirmado: 'Confirmado',
  alquilo: 'Alquiló',
  retiro: 'Retiró',
  devolvio: 'Devolvió',
  cancelado: 'Cancelado',
  'no-vino': 'No vino',
};

// Borde izquierdo por estado. Alquiló (Cobre) y Retiró (Noche) vienen del canvas;
// DISENO.md los pedía en Grafito — ver Supuestos de docs/hitos/1.1-sistema-visual.md.
export const BORDE_ESTADO: Record<EstadoTurno, string> = {
  'sin-confirmar': '#B8862B',
  confirmado: '#5E7F62',
  alquilo: '#A8703F',
  retiro: '#1F2A3C',
  devolvio: '#C9C4B9',
  cancelado: '#C9C4B9',
  'no-vino': '#C9C4B9',
};

const APAGADOS: EstadoTurno[] = ['devolvio', 'cancelado', 'no-vino'];

export function BloqueTurno({
  nombre,
  detalle,
  estado,
  aviso,
}: {
  nombre: string;
  detalle: string;
  estado: EstadoTurno;
  /** Alerta de sincronización (p. ej. "Sin sincronizar con Google Calendar"). Se suma al estado. */
  aviso?: string;
}) {
  const apagado = APAGADOS.includes(estado);
  const conRotulo = estado === 'cancelado' || estado === 'no-vino';
  return (
    <div
      className={`rounded-bloque border border-borde px-[11px] py-2 ${apagado ? 'bg-[#FBFAF7]' : 'bg-lino'}`}
      style={{ borderLeft: `3px solid ${BORDE_ESTADO[estado]}` }}
    >
      <div className={`flex items-center gap-1.5 font-serif text-sm font-semibold ${apagado ? 'text-grafito' : ''}`}>
        <span className="min-w-0 flex-1 truncate">{nombre}</span>
        {conRotulo && (
          <span className="flex-none rounded-pill bg-[#EFEDE8] px-2 py-px font-sans text-[14px] font-medium text-grafito md:text-[11px]">
            {ETIQUETA_ESTADO[estado]}
          </span>
        )}
        {aviso && (
          <span
            className="flex-none font-sans text-[14px] font-semibold text-ambar md:text-xs"
            title={aviso}
            aria-hidden
          >
            ↻!
          </span>
        )}
      </div>
      <div className={`text-[14px] md:text-xs ${apagado ? 'text-[#8A8578]' : 'text-grafito'}`}>{detalle}</div>
      {aviso && (
        <div className="mt-1 text-[14px] font-medium leading-tight text-ambar md:text-[11.5px]">
          <span aria-hidden>↻ </span>
          {aviso}
        </div>
      )}
    </div>
  );
}
