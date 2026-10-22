-- 0108_prueba_final_horario.sql
-- Prueba final automática (pedido de Sofía, 22/10): Lucía la ofrece solo el último día abierto antes
-- del evento y arrancando entre estas dos horas. No tan temprano, por si los sastres todavía no
-- llegaron; no tan tarde, para que si hay que arreglar algo se haga en el día. Van acá y no en el
-- código para que se puedan cambiar desde el panel, como el resto de la agenda.

ALTER TABLE configuracion_agenda
  ADD COLUMN IF NOT EXISTS prueba_final_desde time NOT NULL DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS prueba_final_hasta time NOT NULL DEFAULT '17:30';

COMMENT ON COLUMN configuracion_agenda.prueba_final_desde IS
  'Primer horario en que Lucía ofrece una prueba final (el día anterior al evento).';
COMMENT ON COLUMN configuracion_agenda.prueba_final_hasta IS
  'Último horario de arranque de una prueba final que ofrece Lucía.';
