// Configuración › Agenda › probadores, escalonado y reserva de urgencia (una sola fila):
// PATCH { version, cantidad_probadores?, escalonado_min?, dias_reserva_urgencia? } (H1.9 y
// 0030). dias_reserva_urgencia null = sin reserva. Bajar probadores se rechaza (409) si una
// franja o un turno por venir usa los que desaparecen.
import { rutaEdicionUnica } from '@/lib/edicion/rutas';

export const PATCH = rutaEdicionUnica('agenda');
