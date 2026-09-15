-- Aviso de turno (decisión #10 de Mateo, 15/9): el cartel sale 30 minutos antes de cada
-- turno. Va con 0031_turnos_aviso_y_confirmacion.sql; después lo edita el dueño desde
-- Configuración › Agenda, con historial.
-- Idempotente: carga solo si todavía no hay valor (el panel no deja vaciarlo, así que vacío es
-- que nunca se cargó). Deja su versión en el historial como cualquier edición, firmada 'seed'.
update configuracion_agenda
   set aviso_turno_min = 30, editado_por = 'seed'
 where aviso_turno_min is null;
