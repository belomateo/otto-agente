// Catálogo › editar un modelo (precio, colores, talles, fotos, descripción, activo):
// PATCH { version, ...campos } (H1.9).
import { rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('modelos');
