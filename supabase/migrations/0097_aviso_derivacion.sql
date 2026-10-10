-- 0097_aviso_derivacion.sql — pedido de Mateo (9/10): cuando Lucía pasa una charla al equipo, al
-- equipo le llega un WhatsApp (plantilla aviso_derivacion) al teléfono del local. Hasta hoy la
-- derivación solo se veía en el panel y al cliente se le decía «ya les avisé» sin que nadie avisara
-- (PROCESOS.md § 4, paso 4, pendiente desde el 16/9; queja de la dueña del 7/10).
-- Va por el mismo camino que los recordatorios (cron-envios): envios_pendientes decide a quién le
-- toca, envio_reservar evita que salga dos veces y envio_terminar lo registra. Diferencias:
--   · lo manda cron-envios al teléfono del equipo (secreto DERIVACION_ALQUILER_TEL), no al cliente;
--   · envio_terminar NO lo guarda como mensaje de la charla —Lucía lo leería como algo que le dijo
--     al cliente—: queda solo en la bitácora de esa charla;
--   · misma franja de 9 a 21 que el resto: lo que se deriva de noche sale junto a las 9.
-- Sin el secreto o sin la plantilla aprobada en Meta, cron-envios no manda nada (lo dice en su
-- respuesta). Idempotente.

-- 1. El tipo nuevo.
alter table envios_programados drop constraint if exists envios_programados_tipo_check;
alter table envios_programados add constraint envios_programados_tipo_check
  check (tipo in ('recordatorio_18h', 'agradecimiento_resena', 'recontacto_1', 'recontacto_2', 'aviso_derivacion'));

-- 2. envios_pendientes: la de 0093 (recordatorio que saltea días cerrados) + aviso_derivacion.
create or replace function public.envios_pendientes(p_tipo text, p_tz text, p_ahora timestamp with time zone default now())
 returns table(referencia uuid, cliente_id uuid, telefono text, nombre text, inicio timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $function$
  with decente as (
    -- Franja en la que se puede escribirle a un cliente sin molestar.
    select (p_ahora at time zone p_tz)::time >= time '09:00'
       and (p_ahora at time zone p_tz)::time <  time '21:00' as ok
  )
  -- Recordatorio: turnos sin confirmar que entran en las 18 hs, reservados con más de 24 hs de
  -- anticipación (supuesto #26). Sin condición de fecha: ver el encabezado de 0045.
  select t.id, t.cliente_id, c.telefono, c.nombre, t.inicio
    from turnos t join clientes c on c.id = t.cliente_id, decente
   where decente.ok
     and p_tipo = 'recordatorio_18h'
     and t.estado = 'sin-confirmar' and not t.confirmado and t.recordatorio_enviado_at is null
     and t.inicio > p_ahora and t.inicio <= p_ahora + interval '18 hours'
     and t.creado_at <= t.inicio - interval '24 hours'
     -- 9/10: un turno en un día cerrado (feriado o cierre puntual de cierres_agenda) no recibe
     -- «te esperamos mañana»: el cierre se puede cargar después de que el turno ya estaba reservado.
     and not exists (select 1 from cierres_agenda ca where ca.fecha = (t.inicio at time zone p_tz)::date)
     and envio_disponible(p_tipo, t.id)
  union all
  -- Agradecimiento: turnos devueltos antes de hoy y hace menos de una semana (supuesto #29).
  select t.id, t.cliente_id, c.telefono, c.nombre, t.inicio
    from turnos t join clientes c on c.id = t.cliente_id, decente
   where decente.ok
     and p_tipo = 'agradecimiento_resena'
     and t.estado = 'devolvio' and t.devuelto_at is not null
     and (t.devuelto_at at time zone p_tz)::date < (p_ahora at time zone p_tz)::date
     and t.devuelto_at > p_ahora - interval '7 days'
     and envio_disponible(p_tipo, t.id)
  union all
  -- Recontactos (supuesto #27): charlas que siguen con Lucía (activa y con Lucía prendida), cuyo
  -- último mensaje del cliente fue ayer (recontacto_1) o hace tres días (recontacto_2, solo si salió
  -- el primero y el cliente no contestó), sin turno desde que empezaron, sin un turno activo por
  -- venir, sin un alquiler reciente y que no sean de venta.
  select co.id, co.cliente_id, c.telefono, c.nombre, null::timestamptz
    from conversaciones co
    join clientes c on c.id = co.cliente_id
    join lateral (
      select max(m.enviado_at) as ultimo from mensajes m
       where m.conversacion_id = co.id and m.direccion = 'entrante'
    ) u on true, decente
   where decente.ok
     and p_tipo in ('recontacto_1', 'recontacto_2')
     and co.estado = 'activa' and co.lucia_activa and u.ultimo is not null
     and (u.ultimo at time zone p_tz)::date
         = (p_ahora at time zone p_tz)::date - (case when p_tipo = 'recontacto_1' then 1 else 3 end)
     and not exists (
       select 1 from turnos t
        where t.cliente_id = co.cliente_id
          and t.estado not in ('cancelado', 'no-vino')
          and (t.creado_at >= co.iniciado_at or (t.estado in ('sin-confirmar', 'confirmado') and t.fin > p_ahora)))
     and not exists (
       select 1 from turnos t
        where t.cliente_id = co.cliente_id
          and t.estado in ('alquilo', 'retiro', 'devolvio')
          and t.inicio > p_ahora - interval '60 days')
     and (p_tipo = 'recontacto_1' or exists (
       select 1 from envios_programados e
        where e.tipo = 'recontacto_1' and e.referencia = co.id and e.estado = 'enviado'
          and u.ultimo < e.enviado_at))
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
          and ev.detalle->>'herramienta' = 'enviar_link'
          and ev.detalle->'argumentos'->>'tipo' = 'web-venta')
     -- 8/10: no a quien dijo que escribió por error o que no le interesa (ver el encabezado).
     and not exists (
       select 1 from mensajes m
        where m.conversacion_id = co.id and m.direccion = 'entrante'
          and m.enviado_at >= u.ultimo - interval '30 minutes'
          and lower(concat_ws(' ', m.contenido, m.transcripcion)) ~
              '(sin querer|por error|me equivoqu|equivocad|no era (para|a) (vos|ustedes|este|esta|aca|acá)|no me interesa|ya no (lo |la )?necesito|ya (consegu|alquil|compr)|^\s*no,? gracias)')
     and envio_disponible(p_tipo, co.id)
  union all
  -- 9/10: aviso al equipo por cada derivación pendiente de las últimas 14 horas que todavía no se
  -- avisó. referencia = la derivación; teléfono y nombre = los del CLIENTE (van adentro del aviso, el
  -- destinatario lo pone cron-envios); inicio = cuándo se derivó. 14 horas: lo derivado de noche
  -- (21 a 9) sale a las 9; algo más viejo ya no es noticia, y así tampoco sale el atraso de antes.
  select d.id, co.cliente_id, c.telefono, c.nombre, d.creado_at
    from derivaciones d
    join conversaciones co on co.id = d.conversacion_id
    join clientes c on c.id = co.cliente_id, decente
   where decente.ok
     and p_tipo = 'aviso_derivacion'
     and d.estado = 'pendiente'
     and d.creado_at > p_ahora - interval '14 hours' and d.creado_at <= p_ahora
     and envio_disponible(p_tipo, d.id);
$function$;

-- 3. envio_terminar: la de 0045 + aviso_derivacion, que va al equipo y no es un mensaje de la
-- charla: no se guarda en mensajes (Lucía lo leería como dicho al cliente) y queda en la bitácora
-- de la charla derivada.
create or replace function envio_terminar(
  p_id uuid, p_ok boolean, p_wa_message_id text, p_texto text, p_error text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_envio envios_programados%rowtype;
  v_conversacion uuid;
begin
  select * into v_envio from envios_programados where id = p_id for update;
  if not found then
    raise exception 'envío % inexistente', p_id;
  end if;

  if v_envio.tipo in ('recontacto_1', 'recontacto_2') then
    v_conversacion := v_envio.referencia;
  elsif v_envio.tipo = 'aviso_derivacion' then
    select conversacion_id into v_conversacion from derivaciones where id = v_envio.referencia;
  elsif p_ok then
    v_conversacion := conversacion_abierta_de(v_envio.cliente_id);
  else
    select id into v_conversacion from conversaciones
     where cliente_id = v_envio.cliente_id and estado in ('activa', 'derivada');
  end if;

  if p_ok then
    update envios_programados
       set estado = 'enviado', wa_message_id = p_wa_message_id, enviado_at = now(), error = null,
           actualizado_at = now()
     where id = p_id;
    if v_envio.tipo <> 'aviso_derivacion' then
      insert into mensajes (conversacion_id, wa_message_id, direccion, tipo, contenido)
      values (v_conversacion, p_wa_message_id, 'saliente', 'template', p_texto);
    end if;
    if v_envio.tipo = 'recordatorio_18h' then
      update turnos set recordatorio_enviado_at = now() where id = v_envio.referencia;
    end if;
  else
    update envios_programados set estado = 'error', error = left(p_error, 500), actualizado_at = now()
     where id = p_id;
  end if;

  if v_conversacion is not null then
    insert into eventos_agente (conversacion_id, tipo, detalle)
    values (
      v_conversacion,
      case when p_ok then 'ok' else 'error' end,
      jsonb_strip_nulls(jsonb_build_object(
        'etapa', 'envio_programado', 'tipo', v_envio.tipo, 'plantilla', v_envio.plantilla,
        'intento', v_envio.intentos, 'wa_message_id', p_wa_message_id, 'error', left(p_error, 500)))
    );
  end if;
end;
$$;

-- 4. El reloj: cada minuto, pero solo llama a cron-envios si hay una derivación sin avisar (así no
-- son 1.440 llamadas por día a la función para nada). La franja de 9 a 21 la mira envios_pendientes.
-- cron.schedule con un nombre que ya existe reemplaza el job: correrla dos veces no duplica nada.
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
