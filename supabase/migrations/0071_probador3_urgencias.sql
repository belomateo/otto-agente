-- Probador 3 reservado para urgencias (pedido de Sofi, 30/9).
-- Las franjas que tenían 3 probadores pasan a 2: el sistema automático ofrece hasta 2
-- turnos simultáneos. El equipo puede seguir asignando manualmente el probador 3 para
-- casos urgentes desde el panel (la capacidad total del local sigue siendo 3).
--
-- Franjas afectadas (días 1–6 con probadores=3):
--   Lunes a viernes 13:00–19:00  (3 → 2)
--   Sábado mañana   09:30–12:00  (3 → 2)
--   Sábado tarde    13:15–18:30  ya tenía 2 — no se toca.
UPDATE franjas_turnos
   SET probadores = 2
 WHERE probadores = 3;
