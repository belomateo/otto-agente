'use client';

// Barra de subpestañas de Configuración (DISENO.md § 8). Son subrutas, no estado
// local: cada una se abre por URL. A 390 no entran las seis: la barra se
// desplaza de costado sola, sin mover la página. «Accesos» lleva la cantidad de
// solicitudes pendientes (0 con ?vacio=1, que los links conservan).

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAccesos } from './AccesosContexto';

const PESTANAS = [
  { href: '/configuracion', label: 'Lucía' },
  { href: '/configuracion/agenda', label: 'Agenda' },
  { href: '/configuracion/herramientas', label: 'Herramientas' },
  { href: '/configuracion/enlaces', label: 'Enlaces' },
  { href: '/configuracion/notas', label: 'Notas' },
  { href: '/configuracion/accesos', label: 'Accesos' },
];

export function SubpestanasConfiguracion() {
  const pathname = usePathname();
  const vacio = useSearchParams().get('vacio') === '1';
  const { solicitudes } = useAccesos();
  const pendientes = vacio ? 0 : solicitudes.length;
  const activaRef = useRef<HTMLAnchorElement>(null);

  // A 390 la pestaña activa puede quedar fuera de la barra (Accesos, Notas): se desplaza la barra, no la página.
  useEffect(() => {
    const link = activaRef.current;
    const barra = link?.parentElement;
    if (!link || !barra || barra.scrollWidth <= barra.clientWidth) return;
    barra.scrollLeft = link.offsetLeft - (barra.clientWidth - link.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav className="mt-2.5 flex gap-0.5 overflow-x-auto border-b border-borde text-[14px] font-medium md:mt-3.5">
      {PESTANAS.map(({ href, label }) => {
        const activa = pathname === href;
        return (
          <Link
            key={href}
            ref={activa ? activaRef : undefined}
            href={vacio ? `${href}?vacio=1` : href}
            aria-current={activa ? 'page' : undefined}
            className={`flex flex-none items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 md:px-4 ${
              activa ? '-mb-px border-b-2 border-cobre text-cobre' : 'text-grafito'
            }`}
          >
            {label}
            {href.endsWith('/accesos') && pendientes > 0 && (
              <span className="rounded-pill bg-ladrillo px-[7px] text-[14px] font-semibold leading-[20px] text-lino md:text-[11px] md:leading-[18px]">
                {pendientes}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
