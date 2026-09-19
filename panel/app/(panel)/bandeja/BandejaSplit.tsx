'use client';

// Escritorio: lista + hilo lado a lado. Lo comparten /bandeja (nada preseleccionado: arranca
// en la primera charla) y /bandeja/charla?id=... visto desde una compu (no hay pantalla propia
// de "una charla" en escritorio: se ve el mismo split, con esa charla ya elegida). No pide los
// datos acá — los recibe de la página, que los pide una sola vez y se los pasa también a la
// lista de mobile (misma página, las dos ramas conviven en el DOM).

import { useState } from 'react';
import type { FilaBandeja } from '@/lib/queries/bandeja';
import { ChatThread } from './ChatThread';
import { ConversationList } from './ConversationList';

export function BandejaSplit({
  conversaciones,
  cargando,
  error,
  onReintentar,
  idInicial = null,
}: {
  conversaciones: FilaBandeja[];
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  idInicial?: string | null;
}) {
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const activoId = seleccionId ?? idInicial ?? conversaciones[0]?.id ?? null;

  return (
    <>
      <ConversationList variante="desktop" conversaciones={conversaciones} cargando={cargando} error={error} onReintentar={onReintentar} seleccionId={activoId} onSeleccionar={setSeleccionId} />
      <ChatThread variante="desktop" conversacionId={activoId} />
    </>
  );
}
