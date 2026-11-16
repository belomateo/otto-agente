-- 0121_prueba_final_dias.sql
-- La prueba final es solo de lunes a viernes, nunca sábado (Sofía, 16/11). Como el horario (0108),
-- va acá y no en el código. Días de la semana: 0=dom..6=sáb, como franjas_turnos.
ALTER TABLE configuracion_agenda
  ADD COLUMN IF NOT EXISTS prueba_final_dias integer[] NOT NULL DEFAULT '{1,2,3,4,5}'::integer[];

COMMENT ON COLUMN configuracion_agenda.prueba_final_dias IS
  'Días de la semana (0=dom..6=sáb) en que Lucía ofrece la prueba final: el último de estos antes del evento.';
