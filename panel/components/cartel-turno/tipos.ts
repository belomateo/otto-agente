// Forma del cartel de turno: la define paneles en H1.16 (panel/lib/queries/avisos.ts y
// lib/edicion/aviso-turno.ts), consumida tal cual desde GET /api/turnos/avisos y POST
// /api/turnos/<id>/ok. No se redefine acá para no duplicar y desincronizarse: si paneles
// cambia el shape, TypeScript avisa en el próximo build (import de solo tipos: se borra al
// compilar, así que 'server-only' de esos archivos no llega nunca al bundle del cliente).
export type { AvisoTurno, AvisosDeTurno } from '@/lib/queries/avisos';
export type { RespuestaOkAviso } from '@/lib/edicion/aviso-turno';
