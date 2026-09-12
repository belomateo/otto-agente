'use client';

// Sidebar de escritorio, 216px fijo. Puerto de Sidebar.dc.html. Visible desde
// md hacia arriba (ver app/(panel)/layout.tsx); en mobile la navegación
// principal la resuelve TabbarMobile + la hoja "Más".

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { NAV_ICONS } from './icons';
import { Chip } from '../ui-otto/Chip';

export function Sidebar({ pendientes = 2 }: { pendientes?: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-sidebar flex-none flex-col self-stretch border-r border-borde bg-lino font-sans md:flex">
      <div className="flex items-center gap-[11px] px-5 pb-4 pt-5">
        <Image src="/logo-otto.png" alt="Otto Su Misura" width={40} height={40} className="rounded-pill" />
        <div>
          <div className="font-serif text-[17px] font-semibold tracking-[.01em]">Otto Su Misura</div>
          <div className="mt-px text-[11.5px] text-grafito">Panel de Lucía</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-1.5">
        {NAV_ITEMS.map(({ key, href, label }) => {
          const activo = pathname?.startsWith(href);
          const Icon = NAV_ICONS[key];
          return (
            <Link
              key={key}
              href={href}
              className="flex items-center gap-2.5 rounded-otto px-3 py-2.5 text-sm font-medium"
              style={{
                color: activo ? '#A8703F' : '#5C6068',
                background: activo ? '#F1E6D9' : 'transparent',
              }}
            >
              <Icon />
              <span>{label}</span>
              {key === 'atencion' && pendientes > 0 && (
                <Chip bg="#A6473A" fg="#FFFFFF" className="ml-auto px-[7px] py-px text-[11px] font-semibold">
                  {pendientes}
                </Chip>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 border-t border-borde-suave px-5 py-4">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-cobre-claro font-serif text-sm font-semibold text-cobre">
          M
        </div>
        <div>
          <div className="text-[13px] font-medium">Marcelo</div>
          <div className="text-[11px] text-grafito">Admin</div>
        </div>
      </div>
    </aside>
  );
}
