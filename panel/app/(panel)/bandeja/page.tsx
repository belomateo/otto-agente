'use client';

// Bandeja — conectada a GET /api/bandeja (H1.8, paneles). Puerto de d-bandeja.html
// (escritorio: lista + hilo lado a lado) y m-bandeja.html (mobile: solo la lista; el hilo vive
// en /bandeja/charla). Un solo pedido para las dos ramas (BandejaSplit lo usa en escritorio,
// ConversationList en mobile): conviven en el DOM aunque solo una se vea, según el ancho.

import { SONDEO_LISTAS_MS, useDatos } from '@/components/api/useDatos';
import type { FilaBandeja } from '@/lib/queries/bandeja';
import { BandejaSplit } from './BandejaSplit';
import { ConversationList } from './ConversationList';

export default function BandejaPage() {
  const { datos, cargando, error, recargar } = useDatos<{ conversaciones: FilaBandeja[] }>('/api/bandeja', { sondeoMs: SONDEO_LISTAS_MS });
  const conversaciones = datos?.conversaciones ?? [];

  return (
    <>
      <div className="hidden min-h-0 flex-1 md:flex">
        <BandejaSplit conversaciones={conversaciones} cargando={cargando} error={error} onReintentar={recargar} />
      </div>
      <div className="flex min-h-0 flex-1 md:hidden">
        <ConversationList variante="mobile" conversaciones={conversaciones} cargando={cargando} error={error} onReintentar={recargar} />
      </div>
    </>
  );
}
