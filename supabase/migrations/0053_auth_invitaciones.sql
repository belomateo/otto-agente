-- 0053_auth_invitaciones.sql — pedido de Mateo (17/9, via logica): un admin invita gente por
-- mail como 'equipo' o 'admin' en vez de esperar a que se registren y pidan acceso. Se descarta
-- auth.admin.inviteUserByEmail (necesita SMTP propio y una pantalla de fijar contraseña que hoy
-- no existe): en cambio, pre-aprobación por email — cuando esa persona se registra sola con
-- email+contraseña (como ya funciona hoy), manejar_alta_usuario() la deja pasar directo.
--
-- invitaciones_acceso es una vía directa de escalada de privilegios (quien pueda insertar ahí
-- un rol 'admin' se hace admin solo con registrarse), así que:
--   - nadie inserta directo: solo crear_invitacion(), security definer, re-verifica es_admin()
--     adentro (no confía solo en que la ruta de la API ya lo chequeó);
--   - RLS no da ninguna policy de insert/update a un usuario autenticado: ni siquiera un admin
--     inserta directo por fuera de la función (defensa en profundidad real, no solo de nombre);
--   - solo hay policy de select (admin) y de delete (admin, y solo si sigue sin usar);
--   - el match de email es case-insensitive y exacto (columna siempre en minúscula, sin like);
--   - es de un solo uso (usado_at).
create table invitaciones_acceso (
  email text primary key check (email = lower(email)),
  rol text not null check (rol in ('admin', 'equipo')),
  invitado_por uuid references perfiles(id),
  creado_at timestamptz not null default now(),
  usado_at timestamptz
);

alter table invitaciones_acceso enable row level security;
create policy invitaciones_admin_lee on invitaciones_acceso for select
  using (es_admin());
create policy invitaciones_admin_borra on invitaciones_acceso for delete
  using (es_admin() and usado_at is null);

-- Códigos nuevos para el route handler (respuestas.ts):
--   55001 → 409, ese email ya tiene una cuenta (auth.users)
--   55002 → 409, ya hay una invitación sin usar para ese email
-- Reutiliza los de 0018: 42501 → 403 (no admin), 22023 → 400 (rol inválido).
create or replace function crear_invitacion(p_email text, p_rol text)
returns invitaciones_acceso
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_fila invitaciones_acceso;
begin
  if not es_admin() then
    raise exception 'solo un admin invita gente' using errcode = 'insufficient_privilege';
  end if;
  if p_rol is null or p_rol not in ('admin', 'equipo') then
    raise exception 'rol inválido: %', p_rol using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'esa persona ya tiene cuenta' using errcode = '55001';
  end if;
  if exists (select 1 from invitaciones_acceso i where i.email = v_email and i.usado_at is null) then
    raise exception 'ya hay una invitación pendiente para ese mail' using errcode = '55002';
  end if;

  insert into invitaciones_acceso (email, rol, invitado_por)
  values (v_email, p_rol, auth.uid())
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke execute on function crear_invitacion(text, text) from public, anon;
grant execute on function crear_invitacion(text, text) to authenticated;

-- manejar_alta_usuario() (0010, 0018): si hay una invitación sin usar para lower(new.email), el
-- perfil nace ya aprobado con el rol de la invitación y la solicitud queda 'aprobada' desde el
-- vamos (mismo rastro que si un admin la hubiera resuelto, resuelto_por = quien invitó). Si no
-- hay invitación, todo igual que antes.
create or replace function manejar_alta_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invitaciones_acceso;
begin
  select * into v_inv from invitaciones_acceso
    where email = lower(new.email) and usado_at is null
    for update;

  if v_inv.email is not null then
    insert into perfiles (id, nombre, rol, estado)
    values (new.id, new.raw_user_meta_data ->> 'nombre', v_inv.rol, 'aprobado')
    on conflict (id) do nothing;
    if not exists (select 1 from solicitudes_acceso where perfil_id = new.id) then
      insert into solicitudes_acceso (perfil_id, estado, resuelto_por, resuelto_at)
      values (new.id, 'aprobada', v_inv.invitado_por, now());
    end if;
    update invitaciones_acceso set usado_at = now() where email = v_inv.email;
  else
    insert into perfiles (id, nombre) values (new.id, new.raw_user_meta_data ->> 'nombre')
    on conflict (id) do nothing;
    if not exists (select 1 from solicitudes_acceso where perfil_id = new.id) then
      insert into solicitudes_acceso (perfil_id) values (new.id);
    end if;
  end if;

  return new;
end;
$$;
