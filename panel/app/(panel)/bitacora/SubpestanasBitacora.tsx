'use client';

// Subpestañas de Bitácora: Actividad (/bitacora) y Analista (/bitacora/analista). Son subrutas y
// no estado local para que un link pueda llevar directo a una. Analista reemplaza a la vieja
// «Propuestas», que nunca tuvo datos (10/10, pedido de Mateo: el analista de charlas va solo acá,
// en ningún otro lugar del panel). No lleva número: los pendientes se ven adentro, por noche.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PESTANAS = [
  { href: '/bitacora', label: 'Actividad' },
  { href: '/bitacora/analista', label: 'Analista' },
  { href: '/bitacora/corrector', label: 'Corrector' },
];

export function SubpestanasBitacora() {
  const pathname = usePathname();

  return (
    <nav className="mt-2.5 flex gap-0.5 overflow-x-auto border-b border-borde text-[14px] font-medium">
      {PESTANAS.map((p) => {
        const activa = p.href === '/bitacora' ? pathname === p.href : pathname?.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? 'page' : undefined}
            className={activa ? '-mb-px flex-none border-b-2 border-cobre px-3.5 py-2.5 text-cobre' : 'flex-none px-3.5 py-2.5 text-grafito'}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
