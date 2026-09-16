-- 0022_cron_jobs.sql — hito 1.14 (logica). Los tres crons de envíos por plantilla llaman a la
-- Edge Function cron-envios con el secreto del worker (Vault), igual que el cron de contención
-- de 0020. pg_cron corre en UTC: las 14:00 UTC son las 11:00 en Argentina.
--   · envios-recordatorio, cada 15 minutos: el recordatorio sale en el cuarto de hora en que el
--     turno entra en las 18 hs;
--   · envios-agradecimiento, una vez por día: los turnos devueltos antes de hoy;
--   · envios-recontacto, una vez por día: las charlas sin turno de ayer y de hace tres días.
-- La función no manda nada mientras CRONS_ENVIOS no valga 'on' (se prende cuando Meta aprueba
-- las plantillas): hasta entonces los crons corren y la función contesta que está apagada.
-- cron.schedule con un nombre existente reemplaza el job: correrla dos veces no duplica nada.

select cron.schedule('envios-recordatorio', '*/15 * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-envios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{"tipo": "recordatorio_18h"}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url');
$cron$);

select cron.schedule('envios-agradecimiento', '0 14 * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-envios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{"tipo": "agradecimiento_resena"}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url');
$cron$);

select cron.schedule('envios-recontacto', '5 14 * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-envios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{"tipo": "recontacto"}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url');
$cron$);
