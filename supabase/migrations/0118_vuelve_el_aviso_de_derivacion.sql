-- 0118_vuelve_el_aviso_de_derivacion.sql — 12/11 (Mateo): vuelve el aviso por WhatsApp al equipo cuando Lucía pasa
-- una charla. Se había sacado el 10/10 (0103) porque las derivaciones se veían en la Bandeja, pero al 12/11 había 106
-- pendientes de más de 24 hs y clientes sin respuesta durante días. Es el mismo reloj de 0097. Mientras la plantilla
-- aviso_derivacion no esté aprobada en Meta, cron-envios no manda nada (plantillaAprobada) y solo deja el motivo.
-- Idempotente: cron.schedule con un nombre que ya existe reemplaza el job.

select cron.schedule('envios-aviso-derivacion', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-envios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{"tipo": "aviso_derivacion"}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (
      select 1 from derivaciones d
       where d.estado = 'pendiente' and d.creado_at > now() - interval '14 hours'
         and envio_disponible('aviso_derivacion', d.id));
$cron$);
