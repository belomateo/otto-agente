'use client';

// Barra inferior de mobile — Bandeja · Atención humana · Turnos · Más.
// Puerto de TabbarMobile.dc.html. El resto de las pestañas (Clientes,
// Conocimiento, Catálogo, Bitácora, Configuración) vive detrás de "Más",
// ver MasSheet.tsx — puerto de m-mas.html. Solo existe en mobile, así que los
// textos van directo a 14 px (decisión de Mateo, 13/9), sin variante de escritorio.

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
  pendientes,
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
              aria-current={activo ? 'page' : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-1"
              style={{ color: activo ? '#A8703F' : '#5C6068' }}
            >
              <span className="relative">
                <Icon width={20} height={20} />
                {key === 'atencion' && (pendientes ?? 0) > 0 && (
                  <span className="absolute -right-4 -top-2 min-w-[20px] rounded-pill bg-ladrillo px-1.5 text-center text-[14px] font-semibold leading-[18px] text-lino">
                    {pendientes}
                  </span>
                )}
              </span>
              <span className="text-[14px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMasAbierto(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1"
          style={{ color: enSeccionMas ? '#A8703F' : '#5C6068' }}
        >
          <IconMas width={20} height={20} />
          <span className="text-[14px] font-medium leading-none">Más</span>
        </button>
      </nav>
      <MasSheet abierto={masAbierto} onCerrar={() => setMasAbierto(false)} usuario={usuario} />
    </>
  );
}
