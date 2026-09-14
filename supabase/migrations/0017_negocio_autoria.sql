-- 0017_negocio_autoria.sql — hito 1.9 (paneles), control 2: "cada edición deja su fila
-- de historial con editado_por = el usuario logueado".
--
-- El trigger de historial (0003) guarda OLD.editado_por: la autoría de una versión es lo
-- que se escribió en editado_por al crearla o al editarla. Si eso lo completara el route
-- handler, un handler que se olvide —o un request armado a mano contra la API de Supabase,
-- que cualquier usuario aprobado puede hacer con su propio token— dejaría la edición
-- firmada por otra persona. Acá se fija en la base: cuando escribe una sesión de usuario
-- del panel (hay auth.uid()), editado_por es el email de esa sesión, diga lo que diga el
-- request. Las Edge Functions (service_role: 'lucia', 'webhook') y las conexiones directas
-- (tests, migraciones) no traen usuario y siguen escribiendo lo que mandan.
--
-- Va en todas las tablas que el dueño edita, incluidas clientes, turnos y fragmentos: es
-- la edición del dueño la que se firma, y a las escrituras de Lucía no las toca.
--
-- Y arregla el historial, que desde el panel no funcionaba (ver abajo).
-- Idempotente.

-- El trigger de historial (0003) corría con los permisos de quien edita. Desde el panel eso
-- es el rol `authenticated`, y historial_ediciones solo tiene policy de lectura (0007: la
-- escribe el sistema), así que TODA edición hecha con la sesión de un usuario fallaba con
-- "new row violates row-level security policy for table historial_ediciones" — también la
-- ficha del cliente de 1.15. Los controles de Fase 0 y de 1.15 editaban como postgres, que
-- pasa por encima de RLS, y no lo podían ver.
-- Arreglo: el trigger escribe el historial como dueño de la tabla (security definer). Es el
-- caso legítimo de security definer: la fila de historial sale de OLD (la fila tal como
-- estaba guardada) y de TG_TABLE_NAME, así que el usuario no puede inventar su contenido, y
-- la edición en sí sigue pasando por la RLS de la tabla editada. Abrir INSERT en
-- historial_ediciones a los aprobados, en cambio, dejaría plantar versiones falsas que
-- después se "restauran". Los tres campos de autoría siguen saliendo de OLD (verificador § 2.2).
create or replace function historial_antes_de_editar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into historial_ediciones(tabla, fila_id, version, datos_anteriores, editado_por, editado_at)
  values (TG_TABLE_NAME, OLD.id, OLD.version, to_jsonb(OLD), OLD.editado_por, OLD.editado_at);
  new.version := OLD.version + 1;
  new.editado_at := now();
  return new;
end;
$$;
revoke execute on function historial_antes_de_editar() from public, anon, authenticated;

create or replace function autoria_de_sesion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quien text;
begin
  -- Sin usuario en la sesión (service_role, conexiones directas): se respeta lo que viene.
  if auth.uid() is null then
    return new;
  end if;
  v_quien := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);
  new.editado_por := v_quien;
  -- notas_dueno es la única con autor de creación aparte.
  if TG_TABLE_NAME = 'notas_dueno' and TG_OP = 'INSERT' then
    new.creado_por := v_quien;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'catalogo_alquiler', 'accesorios_alquiler', 'horarios', 'reglas_agente', 'contexto_agente',
    'fragmentos', 'turnos', 'clientes', 'duraciones_turno', 'configuracion_agenda',
    'herramientas_agente', 'enlaces', 'notas_dueno', 'prompt_base'
  ]
  loop
    execute format('drop trigger if exists trg_autoria on %I', t);
    execute format(
      'create trigger trg_autoria before insert or update on %I for each row execute function autoria_de_sesion()',
      t
    );
  end loop;
end $$;

-- Funciones de trigger de paneles: nadie las llama por la API (0020 hace lo mismo con las
-- suyas). El privilegio de EXECUTE se chequea al crear el trigger, no cada vez que dispara.
revoke execute on function autoria_de_sesion() from public, anon, authenticated;
revoke execute on function turnos_validar_probador() from public, anon, authenticated;
revoke execute on function turnos_marcar_cancelacion() from public, anon, authenticated;
