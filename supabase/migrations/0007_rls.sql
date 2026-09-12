-- 0007_rls.sql — RLS en todas las tablas. anon ve cero filas; un usuario autenticado
-- sin perfil aprobado también ve cero filas (control de Fase 0, TRABAJO.md § 2).
--
-- Desvío consciente del orden de STACK.md § 2: la tabla `perfiles` está listada recién
-- en 0010_auth_solicitudes.sql, pero las policies de acá necesitan consultarla. Se crea
-- acá (mínima) y 0010 le suma `solicitudes_acceso` y el trigger de alta. Anotado en
-- docs/supuestos.md.

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol text not null default 'equipo' check (rol in ('admin', 'equipo')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_at timestamptz not null default now()
);

create or replace function es_usuario_aprobado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p where p.id = auth.uid() and p.estado = 'aprobado'
  );
$$;

create or replace function es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.estado = 'aprobado' and p.rol = 'admin'
  );
$$;

alter table perfiles enable row level security;
-- Cualquiera autenticado puede leer su propia fila (para saber si ya lo aprobaron)
-- y un aprobado puede leer todas (pantalla Configuración › Accesos).
create policy perfiles_select on perfiles for select
  using (id = auth.uid() or es_usuario_aprobado());
-- Aprobar/rechazar y cambiar rol es cosa de un admin, nunca del propio usuario
-- (evita que alguien se auto-apruebe); el alta del perfil la hace un trigger
-- security definer (0010_auth_solicitudes.sql), no un insert del usuario.
create policy perfiles_admin_edita on perfiles for update
  using (es_admin()) with check (es_admin());

-- Tablas de negocio: cualquier perfil aprobado (admin o equipo) lee y escribe.
-- Restricciones más finas por campo (p. ej. solo admin en precios) quedan para los
-- route handlers de Fase 1 (rol `paneles`), que sí lee PROCESOS.md § 5 completo.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'conversaciones', 'notas', 'derivaciones',
    'catalogo_alquiler', 'accesorios_alquiler', 'horarios', 'reglas_agente',
    'contexto_agente', 'notas_dueno', 'enlaces', 'turnos', 'fragmentos'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_aprobados on %I for all using (es_usuario_aprobado()) with check (es_usuario_aprobado())',
      t, t
    );
  end loop;
end $$;

-- Tablas de sistema: las escriben solo las Edge Functions (service_role, que
-- pasa por encima de RLS); el panel únicamente lee, si está aprobado.
do $$
declare
  t text;
begin
  foreach t in array array[
    'mensajes', 'eventos_agente', 'cola_trabajos', 'consumo_llm',
    'metricas_diarias', 'historial_ediciones'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_lectura_aprobados on %I for select using (es_usuario_aprobado())',
      t, t
    );
  end loop;
end $$;
