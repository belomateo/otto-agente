// Shell del panel: Sidebar fijo en desktop (md+), TabbarMobile fijo abajo en
// mobile. Persisten entre navegaciones — cada page.tsx renderiza solo su
// contenido, no su propia navegación. Ver ARRANQUE.md H1.2.
//
// Server Component: trae el perfil real (nombre, rol) para el pie del Sidebar/
// MasSheet. El middleware ya garantiza que quien llega hasta acá tiene sesión
// y perfil aprobado (si no, lo redirige a /login o /esperando antes).
//
// El CartelTurno vive acá (y no dentro de cada page.tsx) para no remontarse al
// navegar entre pestañas: un turno cerrado con OK no tiene que reaparecer solo
// porque se cambió de pantalla (H1.17, decisión #10 del 15/9).

import { Sidebar } from '@/components/nav/Sidebar';
import { TabbarMobile } from '@/components/nav/TabbarMobile';
import { UsuarioProvider } from '@/components/nav/UsuarioContext';
import { CartelTurno } from '@/components/cartel-turno/CartelTurno';
import { crearClienteServidor } from '@/lib/supabase/server';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let usuario: { nombre: string; rol: string } | undefined;
  if (user) {
    const { data: perfil } = await supabase.from('perfiles').select('nombre, rol').eq('id', user.id).single();
    usuario = { nombre: perfil?.nombre || user.email?.split('@')[0] || 'Equipo', rol: perfil?.rol ?? 'equipo' };
  }

  // Insignia de Atención humana: conteo real, no el «2» de la maqueta. Un `count` liviano
  // (sin el join de listarDerivaciones, que además trae los últimos mensajes de cada una) para
  // no cargar una consulta pesada en cada navegación; undefined si falla, así no se muestra un
  // número que podría ser cualquier cosa.
  const { count: pendientes } = await supabase.from('derivaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');

  return (
    <UsuarioProvider usuario={usuario}>
      <div className="flex h-dvh">
        <Sidebar usuario={usuario} pendientes={pendientes ?? undefined} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-hueso">{children}</main>
          <div className="md:hidden">
            <TabbarMobile usuario={usuario} pendientes={pendientes ?? undefined} />
          </div>
        </div>
        <CartelTurno />
      </div>
    </UsuarioProvider>
  );
}
