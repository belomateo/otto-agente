// Bandeja — bitácora plegable, etiquetas por charla y adjuntos. Puerto de
// d-bandeja.html (escritorio: lista + hilo lado a lado) y m-bandeja.html
// (mobile: solo la lista; el hilo vive en /bandeja/charla).

import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { pideVacio, type BusquedaPagina } from '../vacio';
import { ConversationList } from './ConversationList';
import { VACIO_BANDEJA } from './vacio-bandeja';
import { ChatThread } from './ChatThread';

export default async function BandejaPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);

  return (
    <>
      <div className="hidden flex-1 md:flex">
        <ConversationList variante="desktop" vacia={vacia} />
        {vacia ? (
          <div className="flex flex-1 items-center justify-center bg-hueso">
            <EstadoVacio titulo={VACIO_BANDEJA.titulo} texto={VACIO_BANDEJA.texto} />
          </div>
        ) : (
          <ChatThread variante="desktop" />
        )}
      </div>
      <div className="flex flex-1 md:hidden">
        <ConversationList variante="mobile" vacia={vacia} />
      </div>
    </>
  );
}
