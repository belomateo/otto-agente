-- 0096_worker_pide_relevo.sql — hallazgo del trabajo 1 (9/10). Con el modelo que piensa, un trabajo
-- puede durar hasta ~2 minutos, así que después de un turno de más de 13 s el worker ya no toma otro
-- en la misma llamada (entraOtroTrabajo, worker/atender.ts) para no pasarse del límite de la
-- función. El segundo mensaje que el cliente manda mientras Lucía piensa quedaba esperando al cron
-- de contención (hasta un minuto más): trg_disparar_worker solo dispara al encolar, y en ese momento
-- cola_tomar_uno saltea la charla porque tiene un turno en curso.
-- Ahora el worker, al irse por tiempo, llama a despertar_worker(): si queda algo pendiente, pide
-- otro worker por pg_net, igual que el trigger. No espera la respuesta (pg_net es asíncrono).
-- Idempotente.

create or replace function despertar_worker()
returns void
language plpgsql
security definer -- lee Vault, igual que disparar_worker (0020)
set search_path = public
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_secreto text := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret');
begin
  if v_url is null or v_secreto is null then
    return; -- sin secretos configurados: lo levanta el cron de contención
  end if;
  -- Mismo interruptor que disparar_worker: las pruebas de la cola no despiertan al worker desplegado.
  if current_setting('otto.sin_disparo', true) = 'on' then
    return;
  end if;
  if not exists (select 1 from cola_trabajos where estado = 'pendiente') then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url || '/functions/v1/worker',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secreto),
      body := jsonb_build_object('motivo', 'relevo')
    );
  exception when others then
    raise warning 'despertar_worker: no se pudo llamar al worker (%); lo levanta el cron', sqlerrm;
  end;
end;
$$;

revoke execute on function despertar_worker() from public, anon, authenticated;
grant execute on function despertar_worker() to service_role;
