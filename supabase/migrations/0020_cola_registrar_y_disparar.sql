-- 0020_cola_registrar_y_disparar.sql — hito 1.11 (logica).
--
-- 1. registrar_mensaje_entrante(): todo lo que el webhook hace en la base, en una sola
--    transacción: cliente, conversación abierta, mensaje (dedup por wa_message_id) y, si la
--    charla la tiene Lucía, un trabajo en la cola. El webhook solo verifica la firma y llama.
-- 2. cola_terminar() y cola_rescatar_trabados(): cierre de un trabajo y rescate de los que
--    quedaron en 'procesando' porque el worker murió (intentos, tope de 3).
-- 3. El worker se dispara al encolar (trigger + pg_net) y un cron cada minuto hace de red de
--    contención (docs/supuestos.md #17). El disparo es best-effort: si falla, el trabajo
--    queda encolado igual y lo levanta el cron.
--
-- Requiere dos secretos en Vault, creados aparte (nunca en este archivo: el repo es público):
--   project_url   → https://<ref>.supabase.co
--   worker_secret → el mismo valor que el secreto WORKER_SECRET de la función `worker`

-- Una sola conversación abierta por cliente, aunque lleguen dos mensajes suyos a la vez.
create unique index if not exists conversaciones_una_abierta_por_cliente
  on conversaciones (cliente_id) where estado in ('activa', 'derivada');

create or replace function registrar_mensaje_entrante(
  p_wa_message_id text,
  p_telefono text,
  p_nombre text,
  p_tipo text,
  p_contenido text,
  p_enviado_at timestamptz,
  p_crudo jsonb
) returns boolean -- true: mensaje nuevo; false: duplicado (Meta reintentó el mismo)
language plpgsql
set search_path = public
as $$
declare
  v_cliente uuid;
  v_conversacion uuid;
  v_estado text;
  v_mensaje uuid;
begin
  insert into clientes (telefono, nombre) values (p_telefono, p_nombre)
  on conflict (telefono) do nothing
  returning id into v_cliente;
  if v_cliente is null then
    select id into v_cliente from clientes where telefono = p_telefono;
    -- Solo se completa el nombre si faltaba: un UPDATE sin cambios igual dejaría historial.
    if p_nombre is not null then
      update clientes set nombre = p_nombre, editado_por = 'webhook'
       where id = v_cliente and nombre is null;
    end if;
  end if;

  insert into conversaciones (cliente_id) values (v_cliente)
  on conflict (cliente_id) where estado in ('activa', 'derivada') do nothing
  returning id, estado into v_conversacion, v_estado;
  if v_conversacion is null then
    select id, estado into v_conversacion, v_estado
      from conversaciones
     where cliente_id = v_cliente and estado in ('activa', 'derivada');
  end if;

  insert into mensajes (conversacion_id, wa_message_id, direccion, tipo, contenido, enviado_at)
  values (v_conversacion, p_wa_message_id, 'entrante', p_tipo, p_contenido, coalesce(p_enviado_at, now()))
  on conflict (wa_message_id) do nothing
  returning id into v_mensaje;
  if v_mensaje is null then
    return false;
  end if;

  update conversaciones set ultimo_mensaje_at = now() where id = v_conversacion;

  -- Derivada: la charla la tiene una persona. El mensaje queda guardado y Lucía no contesta
  -- hasta que alguien la devuelva desde Atención humana (AGENTE.md § 10).
  if v_estado = 'activa' then
    insert into cola_trabajos (conversacion_id, payload)
    values (v_conversacion, jsonb_build_object('mensaje_id', v_mensaje, 'mensaje', p_crudo));
  end if;
  return true;
end;
$$;

create or replace function cola_terminar(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_ok then
    update cola_trabajos set estado = 'hecho', procesado_at = now() where id = p_id;
  else
    -- En un UPDATE, `intentos` del lado derecho es el valor de antes.
    update cola_trabajos
       set intentos = intentos + 1,
           estado = case when intentos + 1 >= 3 then 'error' else 'pendiente' end,
           tomado_por = null,
           tomado_at = null,
           payload = payload || jsonb_build_object('ultimo_error', p_error)
     where id = p_id;
  end if;
end;
$$;

create or replace function cola_rescatar_trabados()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_rescatados integer;
begin
  update cola_trabajos
     set intentos = intentos + 1,
         estado = case when intentos + 1 >= 3 then 'error' else 'pendiente' end,
         tomado_por = null,
         tomado_at = null
   where estado = 'procesando' and tomado_at < now() - interval '5 minutes';
  get diagnostics v_rescatados = row_count;
  return v_rescatados;
end;
$$;

-- Llama al worker. Security definer porque lee Vault, que el rol que encola (service_role)
-- no ve. Es función de trigger: no se puede invocar por la API.
create or replace function disparar_worker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_secreto text := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret');
begin
  if v_url is null or v_secreto is null then
    return new; -- sin secretos configurados: el trabajo espera al cron de contención
  end if;
  -- Interruptor de sesión para tests/sql: la prueba de la cola inserta un trabajo real y
  -- necesita que lo tomen sus dos workers de prueba, no el worker desplegado.
  if current_setting('otto.sin_disparo', true) = 'on' then
    return new;
  end if;
  begin
    perform net.http_post(
      url := v_url || '/functions/v1/worker',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secreto),
      body := jsonb_build_object('motivo', 'nuevo_trabajo', 'id', new.id)
    );
  exception when others then
    raise warning 'disparar_worker: no se pudo llamar al worker (%); lo levanta el cron', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_disparar_worker on cola_trabajos;
create trigger trg_disparar_worker after insert on cola_trabajos
  for each row execute function disparar_worker();

-- Red de contención: cada minuto rescata trabajos trabados y, si queda algo pendiente, llama
-- al worker. cron.schedule con un nombre existente reemplaza el job: es idempotente.
select cron.schedule(
  'worker-contencion',
  '* * * * *',
  $cron$
    select cola_rescatar_trabados();
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
      ),
      body := '{"motivo": "cron"}'::jsonb
    )
    where exists (select 1 from cola_trabajos where estado = 'pendiente')
      and exists (select 1 from vault.decrypted_secrets where name = 'project_url');
  $cron$
);

-- Nada de esto se llama desde el panel ni desde la API pública: solo el service_role (las
-- Edge Functions) y el dueño de las funciones (postgres: triggers, cron y tests/sql).
revoke execute on function registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function cola_tomar_uno(text) from public, anon, authenticated;
revoke execute on function cola_terminar(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function cola_rescatar_trabados() from public, anon, authenticated;
revoke execute on function disparar_worker() from public, anon, authenticated;
grant execute on function registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function cola_tomar_uno(text) to service_role;
grant execute on function cola_terminar(uuid, boolean, text) to service_role;
