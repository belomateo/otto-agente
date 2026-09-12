'use client';

// Hoja "Más" — el resto de las pestañas. Puerto de m-mas.html. Se abre desde
// TabbarMobile; agrupa lo que en desktop está siempre visible en el Sidebar.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NAV_ICONS } from './icons';
import { NAV_ITEMS, NAV_MOBILE_PRINCIPALES } from './nav-items';
import { crearClienteNavegador } from '@/lib/supabase/client';

type Usuario = { nombre: string; rol: string };

export function MasSheet({
  abierto,
  onCerrar,
  usuario,
}: {
  abierto: boolean;
  onCerrar: () => void;
  usuario?: Usuario;
}) {
  const router = useRouter();
  if (!abierto) return null;
  const items = NAV_ITEMS.filter((i) => !NAV_MOBILE_PRINCIPALES.includes(i.key));

  async function salir() {
    await crearClienteNavegador().auth.signOut();
    router.push('/login');
    router.refresh();
  }

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
            {(usuario?.nombre ?? 'Equipo').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{usuario?.nombre ?? 'Equipo'}</div>
            <div className="text-[11.5px] text-grafito">{usuario?.rol === 'admin' ? 'Admin' : 'Equipo'}</div>
          </div>
          <button onClick={salir} className="text-[13px] text-grafito underline">
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
