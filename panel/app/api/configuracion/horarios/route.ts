// Configuración › Agenda › abrir un día que hoy no tiene horario:
// POST { dia_semana, hora_apertura, hora_cierre, corte_desde?, corte_hasta?, activo? } (H1.9).
import { rutaAlta } from '@/lib/edicion/rutas';

export const POST = rutaAlta('horarios');
