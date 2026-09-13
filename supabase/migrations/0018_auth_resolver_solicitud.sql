-- 0018_auth_resolver_solicitud.sql — hito 1.10 (paneles).
--
-- 1. resolver_solicitud(): aprobar o rechazar son DOS escrituras (el perfil y la solicitud)
--    que tienen que quedar juntas. Si el panel las hiciera en dos requests, un corte en el
--    medio deja un perfil aprobado con la solicitud pendiente, o al revés. Acá van en una
--    transacción. Es security invoker: corre con los permisos de quien la llama, así que
--    las policies de 0007 y 0010 (solo un admin actualiza perfiles y solicitudes) siguen
--    siendo el filtro. El chequeo explícito de es_admin() está para devolver un error claro
--    en vez de "0 filas actualizadas".
-- 2. Nadie se aprueba a sí mismo ni se cambia el rol (control 4). La policy de perfiles ya
--    frena a un usuario no admin; el trigger lo frena también para un admin que edita su
--    propia fila (por ejemplo, uno que se saca el rol por error y deja el panel sin admins).
-- 3. manejar_alta_usuario() suma `on conflict do nothing` (informe del verificador § 5): si
--    el perfil ya existía, el alta en auth.users fallaba con "Database error saving new
--    user", que no le dice nada a nadie.
-- Idempotente.

create or replace function perfiles_sin_autoedicion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'el id de un perfil no se cambia' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is not null and old.id = auth.uid()
     and (new.rol is distinct from old.rol or new.estado is distinct from old.estado) then
    raise exception 'nadie puede cambiarse a sí mismo el rol ni el estado'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sin_autoedicion on perfiles;
create trigger trg_sin_autoedicion before update on perfiles
  for each row execute function perfiles_sin_autoedicion();
revoke execute on function perfiles_sin_autoedicion() from public, anon, authenticated;

-- Códigos de error, para que el route handler los traduzca a HTTP:
--   42501 → 403 (no es admin, o es su propia solicitud)
--   P0002 → 404 (la solicitud no existe)
--   22023 → 400 (rol inválido)
--   55000 → 409 (la solicitud ya estaba resuelta)
create or replace function resolver_solicitud(
  p_solicitud uuid,
  p_aprobar boolean,
  p_rol text default 'equipo'
) returns solicitudes_acceso
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sol solicitudes_acceso;
begin
  if not es_admin() then
    raise exception 'solo un admin resuelve solicitudes de acceso' using errcode = 'insufficient_privilege';
  end if;
  if p_rol is null or p_rol not in ('admin', 'equipo') then
    raise exception 'rol inválido: %', p_rol using errcode = 'invalid_parameter_value';
  end if;

  select * into v_sol from solicitudes_acceso where id = p_solicitud for update;
  if v_sol.id is null then
    raise exception 'la solicitud no existe' using errcode = 'no_data_found';
  end if;
  if v_sol.estado <> 'pendiente' then
    raise exception 'la solicitud ya estaba %', v_sol.estado using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_sol.perfil_id = auth.uid() then
    raise exception 'nadie resuelve su propia solicitud' using errcode = 'insufficient_privilege';
  end if;

  update perfiles
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
         rol = case when p_aprobar then p_rol else rol end
   where id = v_sol.perfil_id;

  update solicitudes_acceso
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         resuelto_por = auth.uid(),
         resuelto_at = now()
   where id = p_solicitud
  returning * into v_sol;

  return v_sol;
end;
$$;

revoke execute on function resolver_solicitud(uuid, boolean, text) from public, anon;
grant execute on function resolver_solicitud(uuid, boolean, text) to authenticated;

create or replace function manejar_alta_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre) values (new.id, new.raw_user_meta_data ->> 'nombre')
  on conflict (id) do nothing;
  if not exists (select 1 from solicitudes_acceso where perfil_id = new.id) then
    insert into solicitudes_acceso (perfil_id) values (new.id);
  end if;
  return new;
end;
$$;
