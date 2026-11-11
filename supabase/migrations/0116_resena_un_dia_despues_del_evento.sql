-- 0116_resena_un_dia_despues_del_evento.sql — 11/11 (Mateo): la reseña sale un día después del evento a quien
-- tuvo prueba final. Con la fecha del evento en la ficha ya era así (0112); sin fecha, la prueba final es el día
-- antes del evento, así que pasa de 3 a 2 días después de la prueba. Es 0112 con ese único cambio.
-- Idempotente (create or replace).

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
  -- 3/11 (Mateo): nadie marca los turnos como «devolvió», así que la reseña nunca salió (0 envíos). Ahora también
  -- sale tras la PRUEBA FINAL: el día siguiente al evento de la ficha (o, sin fecha de evento o con una fecha
  -- anterior a la prueba, 2 días después de la prueba: la prueba es el día antes del evento), durante 6 días. No sale si el turno se canceló o no vino.
  select t.id, t.cliente_id, c.telefono, c.nombre, t.inicio
    from turnos t join clientes c on c.id = t.cliente_id
    cross join lateral (
      select (t.inicio at time zone p_tz)::date as dia_prueba
    ) f
    cross join lateral (
      select case when c.fecha_evento is not null and c.fecha_evento >= f.dia_prueba
                  then c.fecha_evento + 1 else f.dia_prueba + 2 end as toca
    ) g, decente
   where decente.ok
     and p_tipo = 'agradecimiento_resena'
     and t.tipo = 'prueba_final'
     and t.estado in ('sin-confirmar', 'confirmado', 'alquilo', 'retiro')
     and t.fin < p_ahora
     and (p_ahora at time zone p_tz)::date >= g.toca
     and (p_ahora at time zone p_tz)::date <= g.toca + 6
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
