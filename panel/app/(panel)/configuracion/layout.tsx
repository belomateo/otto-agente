// Configuración — título y barra de subpestañas compartidos por Lucía, Agenda,
// Herramientas, Enlaces, Notas y Accesos, conectadas a GET /api/configuracion y
// GET /api/accesos (H1.8/H1.9/H1.10, paneles). Un solo pedido de cada uno para las seis
// subpestañas: viven acá para no repetirlo por pantalla.

import { AccesosProvider } from './AccesosContexto';
import { ConfiguracionProvider } from './ConfiguracionContexto';
import { SubpestanasConfiguracion } from './SubpestanasConfiguracion';

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfiguracionProvider>
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
    </ConfiguracionProvider>
  );
}
