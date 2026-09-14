// Bitácora › Propuestas (PROCESOS.md § 6). Lo que el analista nocturno sugiere
// agregar o corregir; el dueño o Mateo decide. Nunca se aplica solo.

import { pideVacio, type BusquedaPagina } from '../../vacio';
import { ListaPropuestas } from './ListaPropuestas';

export default async function PropuestasPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6 md:pt-5">
      <ListaPropuestas vacia={vacia} />
    </div>
  );
}
