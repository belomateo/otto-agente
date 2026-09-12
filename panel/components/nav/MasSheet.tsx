'use client';

// Hoja "Más" — el resto de las pestañas. Puerto de m-mas.html. Se abre desde
// TabbarMobile; agrupa lo que en desktop está siempre visible en el Sidebar.

import Link from 'next/link';
import { NAV_ICONS } from './icons';
import { NAV_ITEMS, NAV_MOBILE_PRINCIPALES } from './nav-items';

export function MasSheet({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  if (!abierto) return null;
  const items = NAV_ITEMS.filter((i) => !NAV_MOBILE_PRINCIPALES.includes(i.key));

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="flex-1 bg-tinta/[.32]" onClick={onCerrar} />
      <div className="rounded-t-2xl bg-lino px-[18px] pb-2.5 pt-[18px]">
        <div className="mx-auto mb-3.5 h-1 w-9 rounded-pill bg-borde" />
        {items.map(({ key, href, label }) => {
          const Icon = NAV_ICONS[key];
          return (
            <Link
              key={key}
              href={href}
              onClick={onCerrar}
              className="flex items-center gap-3 border-b border-borde-suave py-3.5 text-[15px] font-medium text-tinta last:border-b-0"
            >
              <Icon width={20} height={20} className="text-grafito" />
              {label}
            </Link>
          );
        })}
        <div className="mt-1 flex items-center gap-2.5 border-t border-borde py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-cobre-claro font-serif text-sm font-semibold text-cobre">
            J
          </div>
          <div className="flex-1">
            <div className="text-[13.5px] font-medium">Julián</div>
            <div className="text-[11.5px] text-grafito">Equipo</div>
          </div>
          <span className="text-[13px] text-grafito">Salir</span>
        </div>
      </div>
    </div>
  );
}
