-- Corrección franja tarde del sábado (pedido de Mateo, 30/9).
-- Con duracionMin=45 y paso=45 (modo simultáneo), la franja 13:30-18:30 deja el
-- último turno en 17:15 (17:15+45=18:00 ≤ 18:30 ✓, pero 18:00+45=18:45 > 18:30 ✗).
-- Cambiando el inicio a 13:15 la secuencia queda:
--   13:15 → 14:00 → 14:45 → 15:30 → 16:15 → 17:00 → 17:45
-- y 17:45+45=18:30 ≤ 18:30 ✓, así el último turno es a las 17:45 como pide Mateo.
UPDATE franjas_turnos
   SET desde = '13:15'::time
 WHERE dia_semana = 6
   AND desde = '13:30'::time;
