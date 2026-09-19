// Configuración › Herramientas › activar/desactivar y editar la descripción que lee Lucía:
// PATCH { version, activa?, descripcion? } (H1.9).
import { rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('herramientas');
