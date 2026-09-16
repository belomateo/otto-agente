// Configuración › Accesos — conectado a GET /api/accesos y POST /api/accesos/<id> (H1.10,
// paneles). Solo admin: con un usuario 'equipo' el pedido da 403 y Accesos.tsx lo explica.

import { Accesos } from './Accesos';

export default function AccesosPage() {
  return <Accesos />;
}
