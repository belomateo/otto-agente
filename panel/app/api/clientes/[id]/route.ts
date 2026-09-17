// Clientes › la ficha de un cliente: GET (H1.8) y edición de la libreta con historial,
// PATCH { version, ...campos } (H1.9). El GET (la ficha completa: notas, turnos, línea de
// tiempo) es solo admin (decisión de Mateo, 16/9) — es la pestaña Clientes, no la ficha chica
// embebida en la charla. El PATCH sigue abierto al equipo: sigue anotando mientras atiende.
import { rutaConsultaConId } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { rutaEdicion } from '@/lib/edicion/rutas';
import { obtenerCliente } from '@/lib/queries/clientes';

export const GET = rutaConsultaConId(
  async (s, id) => (await obtenerCliente(s.supabase, id)) ?? error(404, 'Ese cliente no existe'),
  { admin: true }
);
export const PATCH = rutaEdicion('clientes');
