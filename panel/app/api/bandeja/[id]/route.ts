// Bandeja › una charla: mensajes, bitácora y ficha resumida (H1.8).
import { rutaConsultaConId } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { obtenerCharla } from '@/lib/queries/bandeja';

export const GET = rutaConsultaConId(async (s, id) => (await obtenerCharla(s.supabase, id)) ?? error(404, 'Esa charla no existe'));
