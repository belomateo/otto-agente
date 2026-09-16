// Bitácora (pestaña 7, ruta /bitacora: decisión de Mateo, 12/9). Título y subpestañas
// compartidos por Actividad y Propuestas. La fecha vive en Actividad (con sus flechas de
// día, GET /api/bitacora?fecha=...): Propuestas no tiene fecha propia, así que ya no va acá.

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
