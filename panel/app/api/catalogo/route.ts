// Catálogo: modelos y accesorios (H1.8). Solo admin (decisión de Mateo, 16/9): lo carga la
// dueña; el equipo no lo necesita para atender.
import { rutaConsulta } from '@/lib/api/consulta';
import { obtenerCatalogo } from '@/lib/queries/catalogo';

export const GET = rutaConsulta(async (s) => obtenerCatalogo(s.supabase), { admin: true });
