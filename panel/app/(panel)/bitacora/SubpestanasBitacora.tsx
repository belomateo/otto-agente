'use client';

// Subpestañas de Bitácora: Actividad (/bitacora) y Propuestas (/bitacora/propuestas). Son
// subrutas y no estado local para que un aviso pueda llevar directo a Propuestas. Propuestas
// no tiene ruta en paneles todavía (el analista nocturno de PROCESOS.md § 6 no está
// construido): sin datos reales que contar, no lleva número — mostrar "0" insinuaría que se
// sabe que no hay ninguna, y no es eso.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PESTANAS = [
  { href: '/bitacora', label: 'Actividad' },
  { href: '/bitacora/propuestas', label: 'Propuestas' },
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
