// Conocimiento: fragmentos agrupados por tema (H1.8).
import { rutaConsulta } from '@/lib/api/consulta';
import { listarFragmentos } from '@/lib/queries/conocimiento';

export const GET = rutaConsulta(async (s) => listarFragmentos(s.supabase));
