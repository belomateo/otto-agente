// Conocimiento — lo que Lucía sabe, por tema. Puerto de d-conocimiento.html y
// m-conocimiento.html. Las propuestas del análisis nocturno ya no van acá: es un
// aviso de una línea que lleva a Bitácora › Propuestas (decisión de Mateo, 13/9).

import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { pideVacio, type BusquedaPagina } from '../vacio';
import { Conocimiento } from './Conocimiento';

export default async function ConocimientoPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);

  return (
    <div className="flex flex-1 flex-col px-4 pb-6 pt-[18px] md:px-7 md:pt-5.5">
      <div className="mb-3 flex max-w-[940px] items-center gap-3 md:mb-4">
        <h1 className="flex-1 font-serif text-[22px] font-semibold">Conocimiento</h1>
        <button type="button" className="rounded-otto bg-cobre px-3.5 py-2.5 text-sm font-medium text-lino md:px-4.5">
          <span className="md:hidden">Nuevo</span>
          <span className="hidden md:inline">Nuevo fragmento</span>
        </button>
      </div>
      <div className="flex max-w-[940px] flex-col gap-3 md:gap-3.5">
        {vacia ? (
          <div className="rounded-otto border border-borde bg-lino">
            <EstadoVacio
              titulo="Lucía todavía no tiene fragmentos"
              texto="Lo que no está cargado acá, Lucía no lo sabe. Empezá con Nuevo fragmento."
            />
          </div>
        ) : (
          <Conocimiento />
        )}
      </div>
    </div>
  );
}
