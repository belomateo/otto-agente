// Configuración › Agenda › horario de un día (apertura, cierre, corte, activo):
// PATCH { version, ...campos } (H1.9). La coherencia (apertura antes del cierre, corte
// adentro del horario) se valida en código antes de escribir.
import { rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('horarios');
