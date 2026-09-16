'use client';

// Conocimiento — conectado a GET /api/conocimiento (H1.8, paneles). Puerto de
// d-conocimiento.html y m-conocimiento.html. Las propuestas del análisis nocturno ya no van
// acá: es un aviso de una línea que lleva a Bitácora › Propuestas (decisión de Mateo, 13/9).

import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { useDatos } from '@/components/api/useDatos';
import type { SeccionConocimiento } from '@/lib/queries/conocimiento';
import { Conocimiento } from './Conocimiento';

const SIN_CONECTAR = 'Todavía no conectado';

export default function ConocimientoPage() {
  const { datos, cargando, error, recargar } = useDatos<{ secciones: SeccionConocimiento[]; total: number }>('/api/conocimiento');
  const secciones = datos?.secciones ?? [];
  const total = datos?.total ?? 0;

  return (
    <div className="flex flex-1 flex-col px-4 pb-6 pt-[18px] md:px-7 md:pt-5.5">
      <div className="mb-3 flex max-w-[940px] items-center gap-3 md:mb-4">
        <h1 className="flex-1 font-serif text-[22px] font-semibold">Conocimiento</h1>
        <button type="button" disabled title={SIN_CONECTAR} className="rounded-otto bg-cobre/50 px-3.5 py-2.5 text-sm font-medium text-lino md:px-4.5">
          <span className="md:hidden">Nuevo</span>
          <span className="hidden md:inline">Nuevo fragmento</span>
        </button>
      </div>
      <div className="flex max-w-[940px] flex-col gap-3 md:gap-3.5">
        {cargando && !datos ? (
          <Cargando />
        ) : error ? (
          <EstadoError mensaje={error} onReintentar={recargar} />
        ) : total === 0 ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio titulo="Lucía todavía no tiene fragmentos" texto="Lo que no está cargado acá, Lucía no lo sabe. Empezá con Nuevo fragmento." />
          </div>
        ) : (
          <Conocimiento secciones={secciones} onGuardado={recargar} />
        )}
      </div>
    </div>
  );
}
