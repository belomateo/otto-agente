-- 0047_cron_horario_decente.sql — hallazgo de la auditoría pre-lanzamiento del 16/9.
--
-- El recordatorio pasó a salir 18 horas antes del turno (0045) y el cron corre cada 15 minutos,
-- de día y de noche. Con el horario nuevo del local, que atiende hasta las 19:00, un turno del
-- jueves a las 18:30 cumple las 18 horas a las 00:30 del jueves: el WhatsApp le suena al cliente
-- a esa hora. Todos los turnos de las 17:00 en adelante caen en esa franja. Antes no pasaba
-- porque la condición vieja exigía además que el turno fuera "mañana", y eso empujaba el aviso a
-- la tarde-noche; al sacarla (había que sacarla, si no el recordatorio no salía nunca) quedó
-- destapada la madrugada.
--
-- Acá: ningún envío sale antes de las 9 ni después de las 21, hora de Argentina. Si el momento
-- cae en la madrugada, el envío espera a las 9 — el cron sigue corriendo cada 15 minutos y lo
-- levanta solo. El único costo es que un turno muy temprano reciba el aviso con menos de 18
-- horas, que es mucho mejor que despertar a alguien.
--
-- Vale para los cuatro tipos, no solo el recordatorio: un agradecimiento o un recontacto a las
-- 3 de la mañana es igual de molesto. Los crons de agradecimiento y recontacto ya corren a las
-- 14:00 UTC (11:00 en Argentina), así que para ellos esto es una red, no un cambio.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

create or replace function envios_pendientes(p_tipo text, p_tz text, p_ahora timestamptz default now())
returns table (referencia uuid, cliente_id uuid, telefono text, nombre text, inicio timestamptz)
language sql
stable
set search_path = public
as $$
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
  -- desde que empezaron y sin un turno activo por venir.
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
     and envio_disponible(p_tipo, co.id);
$$;
