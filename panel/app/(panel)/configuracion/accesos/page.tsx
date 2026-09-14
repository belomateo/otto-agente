// Configuración › Accesos (DISENO.md § 8). Solicitudes pendientes y usuarios.
// Mock: se ve con cualquier usuario aprobado. Ocultarla al rol «equipo» y
// conectar los datos es H1.10 (paneles), sobre esta maqueta.

import { pideVacio, type BusquedaPagina } from '../../vacio';
import { Accesos } from './Accesos';

export default async function AccesosPage({ searchParams }: { searchParams: BusquedaPagina }) {
  return <Accesos vacia={await pideVacio(searchParams)} />;
}
