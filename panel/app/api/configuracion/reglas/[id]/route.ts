// Configuración › Reglas › editar, reordenar o desactivar una regla: PATCH { version, ...campos } (H1.9).
import { rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('reglas');
