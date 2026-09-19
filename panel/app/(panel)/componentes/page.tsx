// Galería de verificación del sistema visual (H1.1). Solo en desarrollo: en el
// build de producción responde 404. No está en el menú; como todo el panel,
// queda detrás del login (middleware). Es la única pantalla donde se ven juntos
// los 10 componentes de DISENO.md con todos sus estados: varios no aparecen en
// ninguna pestaña (ficha compacta y completa, editor, burbuja de mostrador,
// toast de error, estados cancelado / no vino del bloque de turno).

import { notFound } from 'next/navigation';
import { Galeria } from './Galeria';

export default function ComponentesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Galeria />;
}
