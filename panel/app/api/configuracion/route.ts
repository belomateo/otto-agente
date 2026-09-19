// Configuración: Lucía, Agenda, Herramientas, Enlaces y Notas (H1.8). Accesos va aparte
// (/api/accesos, solo admin). Este GET también pasa a solo admin (decisión de Mateo, 16/9):
// el equipo sigue viendo la agenda del día por /api/turnos, no por acá.
import { rutaConsulta } from '@/lib/api/consulta';
import { obtenerConfiguracion } from '@/lib/queries/configuracion';

export const GET = rutaConsulta(async (s) => obtenerConfiguracion(s.supabase), { admin: true });
