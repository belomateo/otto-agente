-- 0044_negocio_catalogo_orden.sql — hito 2.x (paneles), decisión de Mateo (16/9): el catálogo
-- necesita un orden de prioridad por modelo (1 = el que más recomienda Lucía, el que menos
-- peso tiene queda con el número más alto). La dueña lo cambia desde el panel; el panel lo
-- asigna solo al dar de alta (el siguiente número, como reglas_agente.numero) y el catálogo
-- sale ordenado por esta columna. catalogo_alquiler no tiene filas reales todavía (el catálogo
-- arranca vacío a propósito), así que no hace falta backfill.
-- Idempotente.

alter table catalogo_alquiler add column if not exists orden int;
alter table catalogo_alquiler alter column orden set not null;
