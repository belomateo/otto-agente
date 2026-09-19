// Configuración › Agenda › una franja de turnos (0030, decisión #7):
// PATCH { version, ...campos } la edita; DELETE { version } la borra. Las dos dejan la versión
// anterior en el historial, y una franja borrada se vuelve a crear con
// POST /api/historial/<id>/restaurar (las borradas: GET /api/historial?tabla=franjas_turnos&borradas=1).
import { rutaBorrado, rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('franjas');
export const DELETE = rutaBorrado('franjas');
