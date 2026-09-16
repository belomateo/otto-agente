-- 0034_negocio_clientes_busqueda.sql — hito 1.9/2.x (paneles). La búsqueda de Clientes filtraba
-- en memoria sobre los 500 más nuevos (lib/queries/clientes.ts): un cliente viejo que vuelve a
-- escribir daba "no existe" y el equipo le duplicaba la ficha. Esta columna deja buscar por SQL
-- contra toda la tabla, sin tildes ni mayúsculas (immutable_unaccent ya existe, 0005): nombre,
-- teléfono y evento, en ese orden y separados por un espacio, igual que el filtro que reemplaza.
-- Sin índice: la base es chica (mismo criterio que 0005 para fragmentos).
-- Idempotente.

alter table clientes add column if not exists busqueda text generated always as (
  immutable_unaccent(lower(coalesce(nombre, '') || ' ' || coalesce(telefono, '') || ' ' || coalesce(evento, '')))
) stored;
