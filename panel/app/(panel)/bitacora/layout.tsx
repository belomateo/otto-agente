// Bitácora (pestaña 7, ruta /bitacora: decisión de Mateo, 12/9). Título y
// subpestañas compartidos por Actividad y Propuestas; el estado de las
// propuestas vive acá para que el número de la subpestaña acompañe a la lista.

import { PropuestasProvider } from './PropuestasContexto';
import { SubpestanasBitacora } from './SubpestanasBitacora';

export default function BitacoraLayout({ children }: { children: React.ReactNode }) {
  return (
    <PropuestasProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-[18px] md:px-6 md:pt-5.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="font-serif text-[22px] font-semibold">Bitácora</h1>
            <div className="text-sm text-grafito">Sábado 12 de septiembre</div>
          </div>
          <SubpestanasBitacora />
        </div>
        {children}
      </div>
    </PropuestasProvider>
  );
}
