-- 0110_turnos_descripcion.sql
-- Una línea sobre el turno (pedido de Mateo y Sofía, 22/10): la escribe Lucía al agendar o el
-- equipo al cargarlo a mano, y se ve en la agenda sin abrir el turno.

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS descripcion text
  CHECK (descripcion IS NULL OR char_length(descripcion) <= 200);

COMMENT ON COLUMN turnos.descripcion IS 'Una línea sobre el turno: para quién, qué evento, qué busca.';
