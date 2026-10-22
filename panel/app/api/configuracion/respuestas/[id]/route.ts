// Respuestas rápidas › editar (PATCH { version, ...campos }, también para reordenar) y borrar
// (DELETE { version }, queda en el historial). Solo admin (entidades.ts).
import { rutaBorrado, rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('respuestas');
export const DELETE = rutaBorrado('respuestas');
