// Turnos › marcar estado (PROCESOS.md § 2, "En el local" y "Retiro y devolución"):
// PATCH { version, estado, motivo_cancelacion? }. estado ∈ {alquilo, retiro, devolvio,
// no-vino, cancelado}; cancelado exige motivo_cancelacion. Solo transiciones válidas (409 si
// no); deja su fila en historial_ediciones.
import { rutaEdicion } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicion('turnos');
