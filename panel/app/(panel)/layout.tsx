// Shell del panel: Sidebar fijo en desktop (md+), TabbarMobile fijo abajo en
// mobile. Persisten entre navegaciones — cada page.tsx renderiza solo su
// contenido, no su propia navegación. Ver ARRANQUE.md H1.2.

import { Sidebar } from '@/components/nav/Sidebar';
import { TabbarMobile } from '@/components/nav/TabbarMobile';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-hueso">{children}</main>
        <div className="md:hidden">
          <TabbarMobile />
        </div>
      </div>
    </div>
  );
}
