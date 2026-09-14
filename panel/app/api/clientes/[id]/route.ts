// Clientes › la ficha de un cliente: GET (H1.8) y edición de la libreta con historial,
// PATCH { version, ...campos } (H1.9).
import { rutaConsultaConId } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { rutaEdicion } from '@/lib/edicion/rutas';
import { obtenerCliente } from '@/lib/queries/clientes';

export const GET = rutaConsultaConId(async (s, id) => (await obtenerCliente(s.supabase, id)) ?? error(404, 'Ese cliente no existe'));
export const PATCH = rutaEdicion('clientes');
