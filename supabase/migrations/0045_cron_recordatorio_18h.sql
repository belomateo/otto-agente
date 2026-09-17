-- 0045_cron_recordatorio_18h.sql — la dueña, 16/9: el recordatorio del turno va 18 horas antes,
-- no 24.
--
-- Se aprovecha para renombrar el tipo: 'recordatorio_24h' pasa a 'recordatorio_18h' y la
-- plantilla de Meta a `recordatorio_turno_18h`. Es el momento de hacerlo, porque las plantillas
-- todavía no se cargaron en Meta: si se dejaba el nombre viejo, iba a mentir para siempre.
--
-- Y se arregla un agujero que aparece al cambiar el número. La condición vieja era:
--
--     t.inicio <= p_ahora + interval '24 hours'
--     and (t.inicio at time zone p_tz)::date = (p_ahora at time zone p_tz)::date + 1
--
-- O sea: "entra en las 24 hs" Y "es mañana". Con 24 esas dos cosas siempre se solapan, así que
-- funcionaba. Con 18 no: un turno de hoy a las 20:00 pasa a estar a 18 hs recién ayer a las
-- 02:00, cuando todavía faltaban 42 hs; y cuando de verdad entra en las 18 hs ya es "hoy", no
-- "mañana", así que la condición de fecha lo excluye y el recordatorio NO sale nunca. Se saca la
-- condición de fecha: alcanza con "falta menos de 18 hs y todavía no pasó".
--
-- Lo que NO cambia: la guarda de que el turno se haya reservado con más de 24 hs de anticipación
-- (supuesto #26). A quien reserva para mañana a la tarde ya le llegó la confirmación del turno
-- hace un rato: mandarle además un recordatorio es ruido.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

-- Las filas que pudiera haber (los crons están apagados, así que en principio ninguna).
update envios_programados set tipo = 'recordatorio_18h' where tipo = 'recordatorio_24h';

alter table envios_programados drop constraint if exists envios_programados_tipo_check;
alter table envios_programados add constraint envios_programados_tipo_check
  check (tipo in ('recordatorio_18h', 'agradecimiento_resena', 'recontacto_1', 'recontacto_2'));

create or replace function envios_pendientes(p_tipo text, p_tz text, p_ahora timestamptz default now())
returns table (referencia uuid, cliente_id uuid, telefono text, nombre text, inicio timestamptz)
language sql
stable
set search_path = public
as $$
  -- Recordatorio: turnos sin confirmar que entran en las 18 hs, reservados con más de 24 hs de
  -- anticipación (supuesto #26). Sin condición de fecha: ver el encabezado de 0045.
  select t.id, t.cliente_id, c.telefono, c.nombre, t.inicio
    from turnos t join clientes c on c.id = t.cliente_id
   where p_tipo = 'recordatorio_18h'
     and t.estado = 'sin-confirmar' and not t.confirmado and t.recordatorio_enviado_at is null
     and t.inicio > p_ahora and t.inicio <= p_ahora + interval '18 hours'
     and t.creado_at <= t.inicio - interval '24 hours'
     and envio_disponible(p_tipo, t.id)
  union all
  -- Agradecimiento: turnos devueltos antes de hoy y hace menos de una semana (supuesto #29).
  select t.id, t.cliente_id, c.telefono, c.nombre, t.inicio
    from turnos t join clientes c on c.id = t.cliente_id
   where p_tipo = 'agradecimiento_resena'
     and t.estado = 'devolvio' and t.devuelto_at is not null
     and (t.devuelto_at at time zone p_tz)::date < (p_ahora at time zone p_tz)::date
     and t.devuelto_at > p_ahora - interval '7 days'
     and envio_disponible(p_tipo, t.id)
  union all
  -- Recontactos (supuesto #27): charlas que siguen con Lucía, cuyo último mensaje del cliente
  -- fue ayer (recontacto_1) o hace tres días (recontacto_2, solo si salió el primero), sin turno
  -- desde que empezaron y sin un turno activo por venir. Es lo que pidió la dueña el 16/9: al
  -- día siguiente y a los tres días. Ya estaba así.
  select co.id, co.cliente_id, c.telefono, c.nombre, null::timestamptz
    from conversaciones co
    join clientes c on c.id = co.cliente_id
    join lateral (
      select max(m.enviado_at) as ultimo from mensajes m
       where m.conversacion_id = co.id and m.direccion = 'entrante'
    ) u on true
   where p_tipo in ('recontacto_1', 'recontacto_2')
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

-- El cron manda el tipo en el cuerpo: se reprograma con el nombre nuevo. cron.schedule con un
-- nombre que ya existe reemplaza el job, así que correrla dos veces no duplica nada.
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

-- envio_terminar (0021) compara el tipo para marcar turnos.recordatorio_enviado_at. Sin esto,
-- con el nombre nuevo nunca lo marcaría y el mismo turno recibiría el recordatorio una y otra
-- vez. El resto es igual que en 0021.
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
    insert into mensajes (conversacion_id, wa_message_id, direccion, tipo, contenido)
    values (v_conversacion, p_wa_message_id, 'saliente', 'template', p_texto);
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
