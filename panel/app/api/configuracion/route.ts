// Configuración: Lucía, Agenda, Herramientas, Enlaces y Notas (H1.8). Accesos va aparte
// (/api/accesos, solo admin).
import { rutaConsulta } from '@/lib/api/consulta';
import { obtenerConfiguracion } from '@/lib/queries/configuracion';

export const GET = rutaConsulta(async (s) => obtenerConfiguracion(s.supabase));
