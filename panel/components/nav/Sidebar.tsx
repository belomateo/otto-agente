'use client';

// Sidebar de escritorio, 216px fijo. Puerto de Sidebar.dc.html. Visible desde
// md hacia arriba (ver app/(panel)/layout.tsx); en mobile la navegación
// principal la resuelve TabbarMobile + la hoja "Más". En el celular no se ve
// pero sigue en el DOM: los textos chicos llevan 14 px de base y el tamaño del
// canvas recién desde md (decisión de Mateo, 13/9).

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { navVisibles } from './nav-items';
import { NAV_ICONS } from './icons';
import { Chip } from '../ui-otto/Chip';
import { crearClienteNavegador } from '@/lib/supabase/client';

type Usuario = { nombre: string; rol: string };

export function Sidebar({
  pendientes = 2,
  usuario,
}: {
  pendientes?: number;
  usuario?: Usuario;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function salir() {
    await crearClienteNavegador().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="hidden w-sidebar flex-none flex-col self-stretch border-r border-borde bg-lino font-sans md:flex">
      <div className="flex items-center gap-[11px] px-5 pb-4 pt-5">
        <Image src="/logo-otto.png" alt="Otto Su Misura" width={40} height={40} className="rounded-pill" />
        <div>
          <div className="font-serif text-[17px] font-semibold tracking-[.01em]">Otto Su Misura</div>
          <div className="mt-px text-[14px] text-grafito md:text-[11.5px]">Panel de Lucía</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-1.5">
        {navVisibles(usuario?.rol).map(({ key, href, label }) => {
          const activo = pathname?.startsWith(href);
          const Icon = NAV_ICONS[key];
          return (
            <Link
              key={key}
              href={href}
              aria-current={activo ? 'page' : undefined}
              className="flex items-center gap-2.5 rounded-otto px-3 py-2.5 text-sm font-medium"
              style={{
                color: activo ? '#A8703F' : '#5C6068',
                background: activo ? '#F1E6D9' : 'transparent',
              }}
            >
              <Icon />
              <span>{label}</span>
              {key === 'atencion' && pendientes > 0 && (
                <Chip bg="#A6473A" fg="#FFFFFF" className="ml-auto px-[7px] py-px text-[14px] font-semibold md:text-[11px]">
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
          {(usuario?.nombre ?? 'Equipo').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium md:text-[13px]">{usuario?.nombre ?? 'Equipo'}</div>
          <div className="text-[14px] text-grafito md:text-[11px]">{usuario?.rol === 'admin' ? 'Admin' : 'Equipo'}</div>
        </div>
        <button onClick={salir} className="text-[14px] text-grafito underline md:text-[12px]">
          Salir
        </button>
      </div>
    </aside>
  );
}
