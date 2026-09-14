// Configuración — título y barra de subpestañas compartidos por Lucía, Agenda,
// Herramientas, Enlaces, Notas y Accesos. Todas son mock hasta Fase 2: paneles
// conecta la edición del dueño (H1.9) y los accesos (H1.10) sobre estas pantallas.

import { AccesosProvider } from './AccesosContexto';
import { SubpestanasConfiguracion } from './SubpestanasConfiguracion';

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccesosProvider>
      <div className="flex flex-1 flex-col">
        <div className="px-4 pt-[18px] md:px-7 md:pt-5.5">
          <h1 className="font-serif text-[22px] font-semibold">Configuración</h1>
          <SubpestanasConfiguracion />
        </div>
        <div className="flex flex-1 flex-col px-4 pb-6 pt-4 md:px-7 md:pt-5">
          <div className="flex w-full max-w-[820px] flex-col gap-3 md:gap-3.5">{children}</div>
        </div>
      </div>
    </AccesosProvider>
  );
}
