-- 0059_auth_alta_directa.sql — pedido de Mateo (21/9, via logica, a raíz de una auditoría de
-- seguridad): el alta por invitación (0053) tiene un agujero real. Una invitación 'admin' sin
-- usar, sumada a que el proyecto tiene disable_signup:false + mailer_autoconfirm:true, deja que
-- cualquiera que se registre con ese email exacto se vuelva admin aprobado sin probar que es
-- dueño de esa casilla (pasó de verdad con la invitación de cam01back, corregida a mano). En vez
-- de invitar y esperar que la persona se registre sola, un admin crea la cuenta directo
-- (auth.admin.createUser, service role) con una contraseña temporal, y esa cuenta queda obligada
-- a cambiarla antes de poder usar el panel.
--
-- debe_cambiar_clave: no se puede confiar en que "cambió la contraseña" se derive de otra
-- columna (auth.users no distingue "temporal" de "elegida por la persona"), así que es su propia
-- bandera. Nace en false (0007 no la tenía) para no romper ninguna cuenta ya aprobada.
alter table perfiles
  add column debe_cambiar_clave boolean not null default false;

-- completar_alta_admin(): auth.admin.createUser() ya insertó en auth.users y disparó
-- manejar_alta_usuario() (0054), que — al no haber invitación para ese email — deja un perfil
-- 'pendiente' con rol default. Esta función lo termina de dejar como pide el pedido: 'equipo'
-- aprobado que tiene que cambiar la clave antes de nada. Security definer + es_admin() adentro,
-- mismo patrón que crear_invitacion() (0053): no alcanza con que la ruta ya se haya fijado que
-- quien llama es admin.
--
-- También resuelve la solicitudes_acceso que dejó el trigger (si sigue 'pendiente'): si no, la
-- persona aparece en "Solicitudes pendientes" pidiendo un acceso que ya tiene.
--
-- Códigos nuevos para el route handler:
--   P0002 → 404 (ese perfil no existe — reusa el mapeo de 0018)
create or replace function completar_alta_admin(p_perfil uuid)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles;
begin
  if not es_admin() then
    raise exception 'solo un admin da de alta una cuenta' using errcode = 'insufficient_privilege';
  end if;

  update perfiles
     set rol = 'equipo', estado = 'aprobado', debe_cambiar_clave = true
   where id = p_perfil
  returning * into v_perfil;

  if v_perfil.id is null then
    raise exception 'ese perfil no existe' using errcode = 'no_data_found';
  end if;

  update solicitudes_acceso
     set estado = 'aprobada', resuelto_por = auth.uid(), resuelto_at = now()
   where perfil_id = p_perfil and estado = 'pendiente';

  return v_perfil;
end;
$$;

revoke execute on function completar_alta_admin(uuid) from public, anon;
grant execute on function completar_alta_admin(uuid) to authenticated;

-- cambiar_rol(): hoy el rol de una cuenta se fija una sola vez, al resolver la solicitud
-- (resolver_solicitud(), 0018) — no hay forma de "subir de categoría" a alguien ya aprobado.
-- Security definer + es_admin() adentro, mismo patrón. trg_sin_autoedicion (0018) sigue
-- corriendo igual que con cualquier otro UPDATE de perfiles — nadie se sube el rol a sí mismo,
-- ni pasando por acá.
--
-- Códigos nuevos:
--   22023 → 400 (rol inválido, reusa el mapeo de 0018)
--   P0002 → 404 (ese perfil no existe, o no está aprobado)
create or replace function cambiar_rol(p_perfil uuid, p_rol text)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles;
begin
  if not es_admin() then
    raise exception 'solo un admin cambia el rol de una cuenta' using errcode = 'insufficient_privilege';
  end if;
  if p_rol is null or p_rol not in ('admin', 'equipo') then
    raise exception 'rol inválido: %', p_rol using errcode = 'invalid_parameter_value';
  end if;

  update perfiles
     set rol = p_rol
   where id = p_perfil and estado = 'aprobado'
  returning * into v_perfil;

  if v_perfil.id is null then
    raise exception 'ese perfil no existe o no está aprobado' using errcode = 'no_data_found';
  end if;

  return v_perfil;
end;
$$;

revoke execute on function cambiar_rol(uuid, text) from public, anon;
grant execute on function cambiar_rol(uuid, text) to authenticated;

-- terminar_cambio_clave(): la propia persona la llama después de auth.updateUser() para bajar
-- su bandera. No hay policy de UPDATE propia sobre perfiles (0007: cambiar rol/estado es cosa de
-- un admin) así que sin esto nadie podría bajarla sola — security definer, pero sin chequeo de
-- es_admin(): está scopeada a auth.uid(), no recibe ningún id por parámetro.
create or replace function terminar_cambio_clave()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update perfiles set debe_cambiar_clave = false where id = auth.uid();
end;
$$;

revoke execute on function terminar_cambio_clave() from public, anon;
grant execute on function terminar_cambio_clave() to authenticated;
