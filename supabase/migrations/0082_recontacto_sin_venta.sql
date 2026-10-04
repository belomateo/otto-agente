-- El recontacto ("¿todavía estás buscando traje? ¿agendamos un turno?") no va a quien consultó por
-- COMPRAR. Revisión de las últimas 30 charlas (4/10): salió a 4 charlas de venta a las que Lucía ya
-- les había mandado la web de venta; una contestó "Ayer conseguimos todo en el local de Rioja".
-- Una charla es de venta si Lucía mandó el link de venta (enviar_link tipo web-venta).
-- Igual a 0047 salvo el último "not exists" de los recontactos.
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
  -- Recontactos (supuesto #27): charlas que siguen con Lucía, cuyo último mensaje del cliente
  -- fue ayer (recontacto_1) o hace tres días (recontacto_2, solo si salió el primero), sin turno
  -- desde que empezaron, sin un turno activo por venir y que no sean de venta.
  select co.id, co.cliente_id, c.telefono, c.nombre, null::timestamptz
    from conversaciones co
    join clientes c on c.id = co.cliente_id
    join lateral (
      select max(m.enviado_at) as ultimo from mensajes m
       where m.conversacion_id = co.id and m.direccion = 'entrante'
    ) u on true, decente
   where decente.ok
     and p_tipo in ('recontacto_1', 'recontacto_2')
     and co.estado = 'activa' and u.ultimo is not null
     and (u.ultimo at time zone p_tz)::date
         = (p_ahora at time zone p_tz)::date - (case when p_tipo = 'recontacto_1' then 1 else 3 end)
     and not exists (
       select 1 from turnos t
        where t.cliente_id = co.cliente_id
          and t.estado not in ('cancelado', 'no-vino')
          and (t.creado_at >= co.iniciado_at or (t.estado in ('sin-confirmar', 'confirmado') and t.fin > p_ahora)))
     and (p_tipo = 'recontacto_1' or exists (
       select 1 from envios_programados e
        where e.tipo = 'recontacto_1' and e.referencia = co.id and e.estado = 'enviado'))
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
          and ev.detalle->>'herramienta' = 'enviar_link'
          and ev.detalle->'argumentos'->>'tipo' = 'web-venta')
     and envio_disponible(p_tipo, co.id);
$function$;
