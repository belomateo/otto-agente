// Catálogo: modelos y accesorios (H1.8).
import { rutaConsulta } from '@/lib/api/consulta';
import { obtenerCatalogo } from '@/lib/queries/catalogo';

export const GET = rutaConsulta(async (s) => obtenerCatalogo(s.supabase));
