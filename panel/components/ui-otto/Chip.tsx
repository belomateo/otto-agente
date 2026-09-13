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

// 14 px en el celular (decisión de Mateo, 13/9) y el tamaño del canvas desde md.
// Si quien lo usa trae su propio tamaño en className, no se suma el de acá: dos
// text-* en el mismo elemento compiten por el orden del CSS, no por el de la clase.
const TAMANO_POR_DEFECTO = 'text-[14px] md:text-xs';
const traeTamano = (clases: string) => /(^|\s)(md:)?text-(\[\d|xs|sm|base|lg)/.test(clases);

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
  const tamano = traeTamano(className) ? '' : TAMANO_POR_DEFECTO;
  return (
    <span
      className={`inline-flex items-center rounded-pill px-[11px] py-1 font-medium ${tamano} ${className}`}
      style={{ background, color }}
    >
      {children}
    </span>
  );
}
