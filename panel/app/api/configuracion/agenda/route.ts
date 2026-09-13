// Configuración › Agenda › probadores y escalonado (una sola fila):
// PATCH { version, cantidad_probadores?, escalonado_min? } (H1.9). Bajar probadores con turnos
// por venir en los que desaparecen se rechaza (409).
import { rutaEdicionUnica } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicionUnica('agenda');
