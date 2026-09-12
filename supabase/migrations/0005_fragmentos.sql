-- 0005_fragmentos.sql — base de conocimiento que Lucía consulta por herramienta
-- (nunca en el prompt, CLAUDE.md § 2). FTS en español + unaccent: la base es chica
-- y el cliente escribe sin tildes y con errores, así que no hace falta pgvector en V1
-- (STACK.md § 2, decisión ya tomada).

create extension if not exists unaccent with schema extensions;

-- unaccent() de fábrica es STABLE, no IMMUTABLE: Postgres no deja indexar una columna
-- generada que la use directo. Este wrapper la vuelve IMMUTABLE (es determinística en
-- la práctica: mismo texto, mismo resultado) para poder crear el índice GIN abajo.
create or replace function immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;

create table fragmentos (
  id uuid primary key default gen_random_uuid(),
  tema text not null,
  titulo text not null,
  texto text not null,
  activo boolean not null default true,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now(),
  busqueda tsvector generated always as (
    to_tsvector('spanish', immutable_unaccent(coalesce(titulo, '') || ' ' || coalesce(texto, '')))
  ) stored
);
create index fragmentos_busqueda_idx on fragmentos using gin(busqueda);
create index fragmentos_tema_idx on fragmentos(tema);

create trigger trg_historial before update on fragmentos
  for each row execute function historial_antes_de_editar();
