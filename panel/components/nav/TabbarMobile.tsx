'use client';

// Barra inferior de mobile — Bandeja · Atención humana · Turnos · Más.
// Puerto de TabbarMobile.dc.html. El resto de las pestañas (Clientes,
// Conocimiento, Catálogo, Estadísticas, Configuración) vive detrás de "Más",
// ver MasSheet.tsx — puerto de m-mas.html.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { IconAtencion, IconBandeja, IconMas, IconTurnos } from './icons';
import { MasSheet } from './MasSheet';

const TABS = [
  { key: 'bandeja', href: '/bandeja', label: 'Bandeja', Icon: IconBandeja },
  { key: 'atencion', href: '/atencion', label: 'Atención', Icon: IconAtencion },
  { key: 'turnos', href: '/turnos', label: 'Turnos', Icon: IconTurnos },
] as const;

type Usuario = { nombre: string; rol: string };

export function TabbarMobile({
  pendientes = 2,
  usuario,
}: {
  pendientes?: number;
  usuario?: Usuario;
}) {
  const pathname = usePathname();
  const [masAbierto, setMasAbierto] = useState(false);

  // "Más" se marca activo cuando estamos en cualquier pestaña que vive detrás suyo.
  const enSeccionMas = !TABS.some((t) => pathname?.startsWith(t.href));

  return (
    <>
      <nav className="flex h-16 flex-none items-stretch border-t border-borde bg-lino font-sans">
        {TABS.map(({ key, href, label, Icon }) => {
          const activo = pathname?.startsWith(href);
          return (
            <Link
              key={key}
              href={href}
              className="relative flex flex-1 flex-col items-center justify-center gap-[3px]"
              style={{ color: activo ? '#A8703F' : '#5C6068' }}
            >
              <Icon width={20} height={20} />
              <span className="text-[10.5px] font-medium">{label}</span>
              {key === 'atencion' && pendientes > 0 && (
                <span className="absolute right-6 top-[7px] rounded-pill bg-ladrillo px-1.5 py-px text-[10px] font-semibold text-lino">
                  {pendientes}
                </span>
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setMasAbierto(true)}
          className="flex flex-1 flex-col items-center justify-center gap-[3px]"
          style={{ color: enSeccionMas ? '#A8703F' : '#5C6068' }}
        >
          <IconMas width={20} height={20} />
          <span className="text-[10.5px] font-medium">Más</span>
        </button>
      </nav>
      <MasSheet abierto={masAbierto} onCerrar={() => setMasAbierto(false)} usuario={usuario} />
    </>
  );
}
