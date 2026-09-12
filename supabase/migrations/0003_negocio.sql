-- 0003_negocio.sql — catálogo, horarios, reglas del agente y demás datos que el
-- dueño edita desde el panel (CLAUDE.md § 2, principio 12: nunca en el prompt).

-- Historial genérico de ediciones: cualquier tabla con columna `version` que
-- dispare este trigger antes de un UPDATE queda con una fila de historial acá,
-- sin necesitar una tabla-sombra por entidad (convención de TRABAJO.md § 5:
-- "todo dato editable tiene version, editado_por, editado_at y fila de historial").
create table historial_ediciones (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  fila_id uuid not null,
  version int not null,
  datos_anteriores jsonb not null,
  editado_por text,
  editado_at timestamptz not null default now()
);
create index historial_ediciones_tabla_fila_idx on historial_ediciones(tabla, fila_id);

create or replace function historial_antes_de_editar()
returns trigger
language plpgsql
as $$
begin
  insert into historial_ediciones(tabla, fila_id, version, datos_anteriores, editado_por, editado_at)
  values (TG_TABLE_NAME, OLD.id, OLD.version, to_jsonb(OLD), OLD.editado_por, now());
  new.version := OLD.version + 1;
  new.editado_at := now();
  return new;
end;
$$;

create table catalogo_alquiler (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  color text,
  talle text,
  precio_base numeric(12, 2) not null,
  fotos text[] not null default '{}',
  activo boolean not null default true,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
create trigger trg_historial before update on catalogo_alquiler
  for each row execute function historial_antes_de_editar();

create table accesorios_alquiler (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric(12, 2) not null,
  activo boolean not null default true,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
create trigger trg_historial before update on accesorios_alquiler
  for each row execute function historial_antes_de_editar();

-- dia_semana: 0 = domingo ... 6 = sábado (convención de Postgres extract(dow)).
create table horarios (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_apertura time not null,
  hora_cierre time not null,
  corte_desde time,
  corte_hasta time,
  activo boolean not null default true,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now(),
  unique (dia_semana)
);
create trigger trg_historial before update on horarios
  for each row execute function historial_antes_de_editar();

create table reglas_agente (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  texto text not null,
  activo boolean not null default true,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
create trigger trg_historial before update on reglas_agente
  for each row execute function historial_antes_de_editar();

-- Pares clave/valor de contexto libre para el agente (ancla de valor, tono, etc.)
-- que no ameritan su propia tabla. El prompt los consulta por herramienta (CLAUDE.md § 2).
create table contexto_agente (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  valor text not null,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
create trigger trg_historial before update on contexto_agente
  for each row execute function historial_antes_de_editar();

create table notas_dueno (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  texto text not null,
  creado_por text,
  creado_at timestamptz not null default now()
);

create table enlaces (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  url text not null,
  activo boolean not null default true
);
