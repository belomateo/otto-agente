-- 0054_auth_rol_solicitado.sql — pedido de Mateo (17/9, via logica): quien se registra puede
-- pedir un rol, y eso se ve en Solicitudes pendientes antes de aprobar. PURAMENTE INFORMATIVO:
-- rol_solicitado nunca se auto-otorga. perfiles.rol sigue naciendo en su default ('equipo', 0007)
-- y resolver_solicitud() (0018) sigue siendo la única vía para fijar el rol real, con el p_rol
-- que decide un admin — esta migración no la toca. Nullable: una solicitud vieja no lo tiene, y
-- cuando la persona entra por una invitación (0053) el rol ya lo puso quien invitó, no aplica.
alter table solicitudes_acceso
  add column rol_solicitado text check (rol_solicitado in ('admin', 'equipo'));

-- raw_user_meta_data lo pone quien se registra (dato de cliente, no confiable): si mandan
-- cualquier cosa que no sea 'admin'/'equipo' (o nada), se guarda null en vez de romper el alta
-- con la constraint de arriba — nunca falla un registro por un metadata mal formado.
create or replace function manejar_alta_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invitaciones_acceso;
  v_rol_solicitado text;
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
    v_rol_solicitado := new.raw_user_meta_data ->> 'rol_solicitado';
    if v_rol_solicitado not in ('admin', 'equipo') then
      v_rol_solicitado := null;
    end if;
    insert into perfiles (id, nombre) values (new.id, new.raw_user_meta_data ->> 'nombre')
    on conflict (id) do nothing;
    if not exists (select 1 from solicitudes_acceso where perfil_id = new.id) then
      insert into solicitudes_acceso (perfil_id, rol_solicitado) values (new.id, v_rol_solicitado);
    end if;
  end if;

  return new;
end;
$$;
