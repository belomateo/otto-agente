-- 0010_auth_solicitudes.sql — registro abierto pero con aprobación: el perfil nace
-- pendiente y RLS (0007) le devuelve cero filas hasta que un admin lo aprueba desde
-- Configuración › Accesos (CLAUDE.md § 1, H1.10 en TRABAJO.md § 2).

create table solicitudes_acceso (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  solicitado_at timestamptz not null default now(),
  resuelto_at timestamptz,
  resuelto_por uuid references perfiles(id)
);
create index solicitudes_acceso_estado_idx on solicitudes_acceso(estado);

alter table solicitudes_acceso enable row level security;
create policy solicitudes_propia on solicitudes_acceso for select
  using (perfil_id = auth.uid() or es_admin());
create policy solicitudes_admin_resuelve on solicitudes_acceso for update
  using (es_admin()) with check (es_admin());

-- Cada alta en auth.users (registro abierto) crea su perfil pendiente y su
-- solicitud automáticamente. security definer: el usuario recién registrado
-- todavía no tiene perfil aprobado, así que sin esto la propia RLS de 0007 le
-- impediría insertar su primera fila.
create or replace function manejar_alta_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre) values (new.id, new.raw_user_meta_data ->> 'nombre');
  insert into solicitudes_acceso (perfil_id) values (new.id);
  return new;
end;
$$;

create trigger trg_alta_usuario
  after insert on auth.users
  for each row execute function manejar_alta_usuario();
