'use client';

// Charla abierta — /bandeja/charla?id=<id> (m-charla.html en mobile). Es el link que usan el
// cartel de turno (H1.17) y, en Fase 2, cualquier otra pantalla que apunte a una charla puntual.
// En desktop el hilo ya se ve al lado de la lista en /bandeja (no hay pantalla propia), así que
// entrar acá directo desde una compu muestra el mismo split, con esta charla ya elegida.

import { useSearchParams } from 'next/navigation';
import { SONDEO_LISTAS_MS, useDatos } from '@/components/api/useDatos';
import type { FilaBandeja } from '@/lib/queries/bandeja';
import { BandejaSplit } from '../BandejaSplit';
import { ChatThread } from '../ChatThread';

export default function CharlaMobilePage() {
  const id = useSearchParams().get('id');
  const { datos, cargando, error, recargar } = useDatos<{ conversaciones: FilaBandeja[] }>('/api/bandeja', { sondeoMs: SONDEO_LISTAS_MS });

  return (
    <>
      <div className="hidden flex-1 md:flex">
        <BandejaSplit conversaciones={datos?.conversaciones ?? []} cargando={cargando} error={error} onReintentar={recargar} idInicial={id} />
      </div>
      <div className="flex flex-1 md:hidden">
        <ChatThread variante="mobile" conversacionId={id} />
      </div>
    </>
  );
}
