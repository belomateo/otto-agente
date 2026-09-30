-- 0068_agenda_dias_simultaneos.sql
-- Sábados sin escalonamiento entre probadores (pedido de Mateo, 29/9):
-- el sábado el local tiene horario acotado (solo mañana) y los dos probadores
-- tienen que estar disponibles en el mismo slot —no uno con 15' de ventaja—
-- para aprovechar cada hora. dias_simultaneos guarda los días (0=dom..6=sáb)
-- donde aplica esta lógica; default = {6} (sábado).

ALTER TABLE configuracion_agenda
  ADD COLUMN IF NOT EXISTS dias_simultaneos integer[] NOT NULL DEFAULT '{6}'::integer[];

COMMENT ON COLUMN configuracion_agenda.dias_simultaneos IS
  'Días de la semana (0=dom..6=sáb) sin escalonamiento entre probadores: '
  'en esos días ambos atienden a la misma hora (sin ventaja de 15'' entre ellos).';
