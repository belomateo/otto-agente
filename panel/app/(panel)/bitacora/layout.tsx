// Bitácora (pestaña 7, ruta /bitacora: decisión de Mateo, 12/9). Título y subpestañas
// compartidos por Actividad y Analista. La fecha vive en cada subpestaña (Actividad con sus
// flechas de día, Analista con las noches analizadas): no son la misma fecha, así que no va acá.

import { SubpestanasBitacora } from './SubpestanasBitacora';

export default function BitacoraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-[18px] md:px-6 md:pt-5.5">
        <h1 className="font-serif text-[22px] font-semibold">Bitácora</h1>
        <SubpestanasBitacora />
      </div>
      {children}
    </div>
  );
}
