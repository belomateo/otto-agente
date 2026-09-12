// Chip de estado — una palabra, fondo suave. Ver DISENO.md § componentes, 1.
type Estado = 'Confirmado' | 'Sin confirmar' | 'Urgente' | 'Lucía' | 'Persona' | 'Cerrada';

const ESTILOS: Record<Estado, { bg: string; fg: string }> = {
  Confirmado: { bg: '#E7EFE7', fg: '#5E7F62' },
  'Sin confirmar': { bg: '#F7EFDD', fg: '#B8862B' },
  Urgente: { bg: '#F6E3DF', fg: '#A6473A' },
  Lucía: { bg: '#EEF1F5', fg: '#1F2A3C' },
  Persona: { bg: '#F1E6D9', fg: '#A8703F' },
  Cerrada: { bg: '#EFEDE8', fg: '#5C6068' },
};

export function Chip({
  children,
  estado,
  bg,
  fg,
  className = '',
}: {
  children: React.ReactNode;
  estado?: Estado;
  bg?: string;
  fg?: string;
  className?: string;
}) {
  const preset = estado ? ESTILOS[estado] : undefined;
  const background = bg ?? preset?.bg ?? '#EFEDE8';
  const color = fg ?? preset?.fg ?? '#5C6068';
  return (
    <span
      className={`inline-flex items-center rounded-pill px-[11px] py-1 text-xs font-medium ${className}`}
      style={{ background, color }}
    >
      {children}
    </span>
  );
}
