-- 0021_cron_envios.sql — hito 1.14 (logica). Lo que sostiene los envíos que salen solos por
-- plantilla de WhatsApp (PROCESOS.md § 2, supuestos #9 a #11 y #26 a #30):
--   · recordatorio_turno_24h: el día anterior a cada turno sin confirmar, cuando entra en las
--     24 hs, con los botones "Confirmo" / "Necesito reprogramar";
--   · agradecimiento_resena: al día siguiente de marcar 'devolvio' (turnos.devuelto_at);
--   · recontacto_turno_pendiente: al día siguiente y a los tres días del último mensaje de una
--     consulta que no terminó en turno, una vez cada uno.
--
-- envios_programados registra cada envío. unique(tipo, referencia) garantiza en la base que el
-- mismo envío no sale dos veces, aunque el cron corra de más o dos corridas se pisen. Se
-- RESERVA antes de llamar a Meta (envio_reservar) y se TERMINA después (envio_terminar): si
-- Meta falla, la próxima corrida lo reintenta, hasta tres intentos; una reserva colgada más de
-- 15 minutos (la función se cayó en el medio) también se retoma.
-- Cada envío que sale queda como mensaje saliente en la charla del cliente (así Lucía ve qué se
-- le mandó cuando conteste) y como evento en la bitácora.
--
-- El botón "Confirmo" confirma el turno en código (turno_confirmar_por_boton), nunca el LLM, y
-- vale aunque la charla la tenga una persona: registrar_mensaje_entrante encola ese botón
-- también con la charla derivada (el worker solo confirma; Lucía no contesta).
-- Idempotente: correrla dos veces no falla ni duplica nada.

-- 1. Cuándo se marcó 'devolvio'. Mismo patrón que cancelado_at (paneles, 0011).
alter table turnos add column if not exists devuelto_at timestamptz;
comment on column turnos.devuelto_at is
  'Cuándo el turno pasó a devolvio (lo pone trg_marcar_devolucion). El agradecimiento sale al día siguiente (1.14).';

create or replace function turnos_marcar_devolucion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'devolvio' and old.estado is distinct from 'devolvio' then
    new.devuelto_at := coalesce(new.devuelto_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_marcar_devolucion on turnos;
create trigger trg_marcar_devolucion before update of estado on turnos
  for each row execute function turnos_marcar_devolucion();

-- 2. El registro de envíos.
create table if not exists envios_programados (
  id uuid primary key default gen_random_uuid(),
  tipo text not null
    check (tipo in ('recordatorio_24h', 'agradecimiento_resena', 'recontacto_1', 'recontacto_2')),
  referencia uuid not null, -- el turno (recordatorio, agradecimiento) o la charla (recontactos)
  cliente_id uuid not null references clientes(id) on delete cascade,
  plantilla text not null,
  estado text not null default 'reservado' check (estado in ('reservado', 'enviado', 'error')),
  intentos int not null default 1,
  wa_message_id text,
  error text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  enviado_at timestamptz,
  constraint envios_programados_una_vez unique (tipo, referencia)
);
comment on table envios_programados is
  'Envíos por plantilla de WhatsApp (1.14). unique(tipo, referencia): el mismo envío no sale dos veces.';

-- El panel los puede mostrar en la Bitácora; escribe solo el service_role (cron-envios).
alter table envios_programados enable row level security;
drop policy if exists envios_programados_aprobados_leen on envios_programados;
create policy envios_programados_aprobados_leen on envios_programados for select
  to authenticated using (es_usuario_aprobado());

-- 3. La charla abierta del cliente, o una nueva (así su respuesta al envío cae ahí).
create or replace function conversacion_abierta_de(p_cliente uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from conversaciones where cliente_id = p_cliente and estado in ('activa', 'derivada');
  if v_id is null then
    insert into conversaciones (cliente_id) values (p_cliente)
    on conflict (cliente_id) where estado in ('activa', 'derivada') do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from conversaciones where cliente_id = p_cliente and estado in ('activa', 'derivada');
    end if;
  end if;
  return v_id;
end;
$$;

-- 4. ¿Este envío todavía puede salir? Sí si nunca se reservó, si falló con menos de tres
-- intentos o si quedó una reserva colgada. La misma condición usan envios_pendientes y
-- envio_reservar.
create or replace function envio_disponible(p_tipo text, p_referencia uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1 from envios_programados e
     where e.tipo = p_tipo and e.referencia = p_referencia
       and not ((e.estado = 'error' and e.intentos < 3)
             or (e.estado = 'reservado' and e.actualizado_at < now() - interval '15 minutes'))
  );
$$;

-- 5. A quién le toca cada envío ahora. p_tz es la zona del negocio (NEGOCIO_TZ): "mañana",
-- "ayer" y "hace tres días" son días de calendario en Argentina, no en UTC.
create or replace function envios_pendientes(p_tipo text, p_tz text, p_ahora timestamptz default now())
returns table (referencia uuid, cliente_id uuid, telefono text, nombre text, inicio timestamptz)
language sql
stable
set search_path = public
as $$
  -- Recordatorio: turnos sin confirmar de mañana que ya entraron en las 24 hs, reservados con
  -- más de 24 hs de anticipación: a quien reserva hoy para mañana le acaba de llegar la
  -- confirmación del turno (supuesto #26).
  select t.id, t.cliente_id, c.telefono, c.nombre, t.inicio
    from turnos t join clientes c on c.id = t.cliente_id
   where p_tipo = 'recordatorio_24h'
     and t.estado = 'sin-confirmar' and not t.confirmado and t.recordatorio_enviado_at is null
     and t.inicio > p_ahora and t.inicio <= p_ahora + interval '24 hours'
     and (t.inicio at time zone p_tz)::date = (p_ahora at time zone p_tz)::date + 1
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
  -- desde que empezaron y sin un turno activo por venir.
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

-- 6. Reservar antes de mandar: devuelve el id, o null si ya salió, lo está mandando otra
-- corrida o se agotaron los intentos.
create or replace function envio_reservar(p_tipo text, p_referencia uuid, p_cliente uuid, p_plantilla text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into envios_programados (tipo, referencia, cliente_id, plantilla)
  values (p_tipo, p_referencia, p_cliente, p_plantilla)
  on conflict (tipo, referencia) do update
     set estado = 'reservado', intentos = envios_programados.intentos + 1, error = null, actualizado_at = now()
   where (envios_programados.estado = 'error' and envios_programados.intentos < 3)
      or (envios_programados.estado = 'reservado' and envios_programados.actualizado_at < now() - interval '15 minutes')
  returning id into v_id;
  return v_id;
end;
$$;

-- 7. Terminar después de mandar: si salió, queda el mensaje en la charla, el evento en la
-- bitácora y, en el recordatorio, turnos.recordatorio_enviado_at. Si falló, queda el error.
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

  -- Recontacto: la charla es la referencia. Recordatorio y agradecimiento: la charla abierta
  -- del cliente; si el envío salió y no tenía una, se abre (su respuesta cae ahí).
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
    if v_envio.tipo = 'recordatorio_24h' then
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

-- 8. El botón "Confirmo": confirma el turno si es de ese cliente, sigue por venir y estaba sin
-- confirmar. 'confirmado', 'ya_estaba' (lo había confirmado él o el equipo) o 'no_corresponde'.
create or replace function turno_confirmar_por_boton(p_turno uuid, p_conversacion uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_cliente uuid;
  v_estado text;
  v_fin timestamptz;
begin
  select cliente_id into v_cliente from conversaciones where id = p_conversacion;
  select estado, fin into v_estado, v_fin from turnos where id = p_turno and cliente_id = v_cliente for update;
  if not found or v_fin <= now() or v_estado not in ('sin-confirmar', 'confirmado') then
    return 'no_corresponde';
  end if;
  if v_estado = 'confirmado' then
    return 'ya_estaba';
  end if;
  update turnos
     set estado = 'confirmado', confirmado = true, confirmado_at = now(), confirmado_por = 'cliente'
   where id = p_turno;
  return 'confirmado';
end;
$$;

-- 9. registrar_mensaje_entrante (0020) con una sola diferencia: el botón "Confirmo" se encola
-- aunque la charla esté derivada. El payload es el de _shared/whatsapp/botones.ts.
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
  -- hasta que alguien la devuelva desde Atención humana (AGENTE.md § 10). Excepción: el botón
  -- "Confirmo" de un recordatorio (1.14) se encola igual. Confirmar el turno es código, no una
  -- respuesta de Lucía, y no puede esperar a que alguien retome la charla.
  if v_estado = 'activa'
     or (p_tipo = 'button' and coalesce(p_crudo -> 'button' ->> 'payload', '') like 'CONFIRMO:%') then
    insert into cola_trabajos (conversacion_id, payload)
    values (v_conversacion, jsonb_build_object('mensaje_id', v_mensaje, 'mensaje', p_crudo));
  end if;
  return true;
end;
$$;

-- 10. El texto con que se contesta el botón "Confirmo". Es dato: el dueño lo edita.
insert into contexto_agente (clave, valor)
values ('texto_turno_confirmado', '¡Gracias por confirmar! Te esperamos en el local.')
on conflict (clave) do nothing;

-- Nada de esto se llama desde el panel ni desde la API pública: solo el service_role (las Edge
-- Functions) y el dueño de las funciones (postgres: triggers, cron y tests/sql).
revoke execute on function turnos_marcar_devolucion() from public, anon, authenticated;
revoke execute on function conversacion_abierta_de(uuid) from public, anon, authenticated;
revoke execute on function envio_disponible(text, uuid) from public, anon, authenticated;
revoke execute on function envios_pendientes(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function envio_reservar(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function envio_terminar(uuid, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function turno_confirmar_por_boton(uuid, uuid) from public, anon, authenticated;
revoke execute on function registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function conversacion_abierta_de(uuid) to service_role;
grant execute on function envio_disponible(text, uuid) to service_role;
grant execute on function envios_pendientes(text, text, timestamptz) to service_role;
grant execute on function envio_reservar(text, uuid, uuid, text) to service_role;
grant execute on function envio_terminar(uuid, boolean, text, text, text) to service_role;
grant execute on function turno_confirmar_por_boton(uuid, uuid) to service_role;
grant execute on function registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) to service_role;
