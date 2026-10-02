-- Confirmado por el dueño el 1/10/2026. No altera turnos existentes.
UPDATE horarios SET activo = false WHERE dia_semana = 0;
