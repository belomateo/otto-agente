-- 0111_seguimiento_23h.sql — pedido de Mateo (3/11): a las 23 horas del último mensaje, un
-- seguimiento a quien mostró interés y dejó de contestar. Dentro de las 24 hs Meta deja escribir texto
-- libre, así que no hace falta plantilla. Quién cuenta como «con interés» lo decide Claude (Haiku) al
-- armar el envío (cron-envios); acá solo se arma la lista de charlas que se pueden mirar.
-- Mide el hueco real (3/11): de 949 clientes, 235 mostraron interés y no volvieron.
-- Idempotente.

-- 1. El tipo nuevo.
alter table envios_programados drop constraint if exists envios_programados_tipo_check;
alter table envios_programados add constraint envios_programados_tipo_check
  check (tipo in ('recordatorio_18h', 'agradecimiento_resena', 'recontacto_1', 'recontacto_2', 'aviso_derivacion', 'seguimiento_23h'));

-- 2. Los cuatro textos, editables desde Configuración como el resto de los textos fijos.
-- {nombre} se reemplaza por el nombre de pila; sin nombre, queda «Hola!».
insert into contexto_agente (clave, valor) values
  ('texto_seguimiento_sin_fecha', 'Hola {nombre}! Quedó pendiente saber para qué fecha necesitás el traje, así te busco el mejor horario para venir a probártelo. Me contás? 😊'),
  ('texto_seguimiento_con_fecha', 'Hola {nombre}! Te busco un turno para venir a probarte? Decime qué días te quedan cómodos y lo coordinamos.'),
  ('texto_seguimiento_horarios', 'Hola {nombre}! Te sirvió alguno de los horarios que te pasé? Si ninguno te viene bien, decime qué días te quedan cómodos y lo vemos.'),
  ('texto_seguimiento_consulta', 'Hola {nombre}! Pudiste pensarlo? Si te quedó alguna duda, contame y te ayudo. 😊')
on conflict (clave) do nothing;

-- 3. envios_pendientes (la de 0097): el seguimiento reemplaza al primer recontacto.
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
     -- 3/11: el segundo recontacto sigue al primero o al seguimiento de 23 hs; y si el seguimiento ya
     -- salió después del último mensaje del cliente, no sale además el primer recontacto (llegarían
     -- dos mensajes con una hora de diferencia).
     and (p_tipo = 'recontacto_1' or exists (
       select 1 from envios_programados e
        where e.tipo in ('recontacto_1', 'seguimiento_23h') and e.referencia = co.id and e.estado = 'enviado'
          and u.ultimo < e.enviado_at))
     and (p_tipo <> 'recontacto_1' or not exists (
       select 1 from envios_programados e
        where e.tipo = 'seguimiento_23h' and e.referencia = co.id and e.estado = 'enviado'
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

-- 4. envio_terminar (la de 0097): el seguimiento queda en la charla como texto de Lucía.
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

  if v_envio.tipo in ('recontacto_1', 'recontacto_2', 'seguimiento_23h') then
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
      values (v_conversacion, p_wa_message_id, 'saliente',
              case when v_envio.tipo = 'seguimiento_23h' then 'text' else 'template' end, p_texto);
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

-- 5. Las charlas que se pueden mirar para el seguimiento: con Lucía, sin turno, cuyo último mensaje fue
-- de Lucía (no del equipo ni el «perdón la demora») y el del cliente fue hace entre 11 y casi 24 hs.
-- La hora exacta de envío y el horario de 9 a 21 los resuelve cron-envios (_shared/seguimiento).
create or replace function public.seguimiento_candidatos(p_ahora timestamp with time zone default now())
 returns table(referencia uuid, cliente_id uuid, telefono text, nombre text, ultimo_cliente timestamptz,
               busco_horarios boolean, tiene_fecha boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
  select co.id, co.cliente_id, c.telefono, c.nombre, u.ultimo,
         exists (select 1 from eventos_agente ev
                  where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
                    and ev.detalle->>'herramienta' = 'buscar_horarios' and (ev.detalle->>'ok')::boolean),
         c.fecha_evento is not null
    from conversaciones co
    join clientes c on c.id = co.cliente_id
    join lateral (
      select m.direccion, m.contenido from mensajes m
       where m.conversacion_id = co.id order by m.enviado_at desc limit 1
    ) ult on true
    join lateral (
      select max(m.enviado_at) as ultimo from mensajes m
       where m.conversacion_id = co.id and m.direccion = 'entrante'
    ) u on true
   where co.estado = 'activa' and co.lucia_activa and co.canal <> 'prueba' and u.ultimo is not null
     and ult.direccion = 'saliente'
     and coalesce(ult.contenido, '') not like '[mostrador]%'
     and coalesce(ult.contenido, '') not like 'Perdón la demora%'
     and not exists (
       select 1 from mensajes m
        where m.conversacion_id = co.id and m.direccion = 'saliente'
          and m.contenido like '[mostrador]%' and m.enviado_at > u.ultimo)
     and u.ultimo <= p_ahora - interval '11 hours'
     and u.ultimo >  p_ahora - interval '24 hours' + interval '5 minutes'
     and c.telefono !~ '^5490000000'
     -- sin turno desde que empezó la charla ni uno activo por venir; sin alquiler reciente (mismo criterio
     -- que el recontacto)
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
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
          and ev.detalle->>'herramienta' = 'enviar_link'
          and ev.detalle->'argumentos'->>'tipo' = 'web-venta')
     -- ya se miró esta charla desde el último mensaje del cliente (cron-envios deja un pensamiento,
     -- etapa seguimiento, cuando decide que no): no se vuelve a preguntar cada 15 minutos
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'pensamiento'
          and ev.detalle->>'etapa' = 'seguimiento' and ev.creado_at > u.ultimo)
     and envio_disponible('seguimiento_23h', co.id);
$function$;

revoke execute on function public.seguimiento_candidatos(timestamptz) from public, anon, authenticated;

-- 6. El reloj: cada 15 minutos, y solo llama a cron-envios si hay algo para mirar. cron.schedule con un
-- nombre que ya existe reemplaza el job.
select cron.schedule('envios-seguimiento-23h', '*/15 * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cron-envios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{"tipo": "seguimiento_23h"}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (select 1 from seguimiento_candidatos());
$cron$);
