'use client';

// Subpestañas de Bitácora: Actividad (/bitacora) y Propuestas (/bitacora/propuestas).
// Son subrutas y no estado local para que un aviso (p. ej. el de Conocimiento)
// pueda llevar directo a Propuestas. Con ?vacio=1 el número va en 0 y los links
// conservan el parámetro, así se recorren los estados vacíos sin retipear la URL.

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { usePropuestas } from './PropuestasContexto';

export function SubpestanasBitacora() {
  const pathname = usePathname();
  const vacio = useSearchParams().get('vacio') === '1';
  const { pendientes } = usePropuestas();
  const sufijo = vacio ? '?vacio=1' : '';

  const pestanas = [
    { href: '/bitacora', label: 'Actividad', activa: pathname === '/bitacora' },
    {
      href: '/bitacora/propuestas',
      label: `Propuestas · ${vacio ? 0 : pendientes}`,
      activa: pathname?.startsWith('/bitacora/propuestas'),
    },
  ];

  return (
    <nav className="mt-2.5 flex gap-0.5 overflow-x-auto border-b border-borde text-[14px] font-medium">
      {pestanas.map((p) => (
        <Link
          key={p.href}
          href={p.href + sufijo}
          aria-current={p.activa ? 'page' : undefined}
          className={
            p.activa
              ? '-mb-px flex-none border-b-2 border-cobre px-3.5 py-2.5 text-cobre'
              : 'flex-none px-3.5 py-2.5 text-grafito'
          }
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
