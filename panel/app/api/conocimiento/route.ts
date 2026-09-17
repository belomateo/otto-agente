// Conocimiento: fragmentos agrupados por tema (H1.8). Solo admin (decisión de Mateo, 16/9):
// lo mantiene la dueña; el equipo no lo necesita para atender.
import { rutaConsulta } from '@/lib/api/consulta';
import { listarFragmentos } from '@/lib/queries/conocimiento';

export const GET = rutaConsulta(async (s) => listarFragmentos(s.supabase), { admin: true });
