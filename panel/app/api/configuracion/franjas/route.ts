// Configuración › Agenda › nueva franja de turnos (0030, decisión #7):
// POST { dia_semana, desde, hasta, probadores }. Se rechaza si se pisa con otra del mismo día
// (409) o si pide más probadores que los de la agenda (400).
import { rutaAlta } from '@/lib/edicion/rutas';

export const POST = rutaAlta('franjas');
