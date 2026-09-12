// Bloque de turno — los cinco estados. Ver DISENO.md § componentes, 5.
// El orden real del ciclo es Confirmado → Alquiló → Retiró → Devolvió;
// "Sin confirmar" es el estado inicial y "Con aviso" es la excepción (algo
// falló, típicamente la sincronización con Google Calendar).

export type EstadoTurno = 'sin-confirmar' | 'confirmado' | 'alquilo' | 'retiro' | 'devolvio' | 'con-aviso';

const BORDE: Record<EstadoTurno, string> = {
  'sin-confirmar': '#B8862B',
  confirmado: '#5E7F62',
  alquilo: '#A8703F',
  retiro: '#1F2A3C',
  devolvio: '#C9C4B9',
  'con-aviso': '#B8862B',
};

export function BloqueTurno({
  nombre,
  detalle,
  estado,
  avisoTexto,
}: {
  nombre: string;
  detalle: string;
  estado: EstadoTurno;
  /** solo para estado "con-aviso": qué falló (p.ej. "sin sincronizar con Calendar") */
  avisoTexto?: string;
}) {
  const apagado = estado === 'devolvio';
  return (
    <div
      className={`rounded-bloque border px-[11px] py-2 ${apagado ? 'bg-[#FBFAF7]' : 'bg-lino'} border-borde`}
      style={{ borderLeft: `3px solid ${BORDE[estado]}` }}
    >
      <div className={`flex items-center gap-1.5 font-serif text-sm font-semibold ${apagado ? 'text-grafito' : ''}`}>
        <span className="flex-1">{nombre}</span>
        {estado === 'con-aviso' && <span className="text-xs font-sans font-semibold text-ambar">↻!</span>}
      </div>
      <div className={`text-xs ${apagado ? 'text-[#8A8578]' : 'text-grafito'}`}>
        {estado === 'con-aviso' ? avisoTexto : detalle}
      </div>
    </div>
  );
}
