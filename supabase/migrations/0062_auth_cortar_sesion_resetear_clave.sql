-- 0062_auth_cortar_sesion_resetear_clave.sql — dos pedidos de Mateo (22/9, confirmando un
-- hallazgo de la auditoría): quitar el acceso tiene que cortar la sesión, no solo el acceso a
-- datos nuevos, y hace falta una forma de resetear la clave de alguien sin depender de mail
-- (Resend en modo sandbox rebota a cualquiera que no sea la cuenta dueña).
--
-- CÓMO CORTA LA SESIÓN. auth.admin.signOut(jwt, scope) del SDK pide el JWT de esa sesión, no un
-- user_id — no sirve para cortarle la sesión a OTRA persona sin tener su token (confirmado
-- contra la documentación real, no de memoria: mismo error que casi se comete ayer con el scope
-- de signOut). En cambio, se borra directo de auth.sessions: la FK a auth.refresh_tokens (y de
-- ahí a auth.mfa_amr_claims) es ON DELETE CASCADE, así que un solo delete deja sin refresh token
-- válido a todas las sesiones de esa persona — no puede volver a entrar aunque no cambie la
-- contraseña. Limitación real, documentada por Supabase, no un bug de esto: un access token
-- (JWT) YA EMITIDO sigue siendo válido hasta que expira solo (por defecto, hasta 1 hora) — no
-- hay forma de invalidar un JWT antes de tiempo. Es la misma limitación que tiene cualquier
-- "cerrar sesión" de cualquier app hecha con Supabase, no algo que esta función deje sin hacer.
create or replace function revocar_sesiones(p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'solo un admin corta la sesión de alguien' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.sessions where user_id = p_perfil;
end;
$$;

revoke execute on function revocar_sesiones(uuid) from public, anon;
grant execute on function revocar_sesiones(uuid) to authenticated;

-- forzar_cambio_clave(): reusa exactamente el mecanismo de la alta directa (0059) — el route
-- handler genera la clave temporal con crypto.randomUUID() y la cambia con
-- auth.admin.updateUserById (service role); esto solo pone debe_cambiar_clave en true, para que
-- el middleware la mande a /cambiar-clave la próxima vez que entre. No toca rol ni estado: la
-- cuenta sigue aprobada, solo tiene que poner una clave nueva.
create or replace function forzar_cambio_clave(p_perfil uuid)
returns perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles;
begin
  if not es_admin() then
    raise exception 'solo un admin resetea la clave de alguien' using errcode = 'insufficient_privilege';
  end if;

  update perfiles
     set debe_cambiar_clave = true
   where id = p_perfil and estado = 'aprobado'
  returning * into v_perfil;

  if v_perfil.id is null then
    raise exception 'ese perfil no existe o no está aprobado' using errcode = 'no_data_found';
  end if;

  return v_perfil;
end;
$$;

revoke execute on function forzar_cambio_clave(uuid) from public, anon;
grant execute on function forzar_cambio_clave(uuid) to authenticated;
