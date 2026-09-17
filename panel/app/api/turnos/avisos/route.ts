// Aviso de turno (H1.16, decisión #10): GET /api/turnos/avisos → { aviso_turno_min, turnos }, los
// turnos con el cartel abierto ahora, para cualquier usuario aprobado. front lo consulta cada 30
// segundos o menos (1.17).
import { rutaConsulta } from '@/lib/api/consulta';
import { turnosPorAvisar } from '@/lib/queries/avisos';

export const GET = rutaConsulta(async (s) => turnosPorAvisar(s.supabase, s.perfil.rol === 'admin'));
