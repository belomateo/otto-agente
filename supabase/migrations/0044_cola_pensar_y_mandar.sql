-- 0044_cola_pensar_y_mandar.sql — los tres hallazgos de la cañería (auditoría del 16/9),
-- con las decisiones de Mateo.
--
-- El worker hacía todo de un saque: pensaba la respuesta, la guardaba y la mandaba. Eso dejaba
-- tres agujeros:
--
--  1. Si Meta fallaba al mandar, el worker borraba lo que faltaba, anotaba el error y daba el
--     trabajo por HECHO. El cliente no recibía nada y no se reintentaba nunca. (Eso se arregla
--     en el código: ahora relanza el error y el trabajo vuelve a la cola.)
--  2. Al tercer intento fallido el trabajo quedaba en 'error' y ahí moría: nadie lo levantaba,
--     nada avisaba. Decisión de Mateo: **dos intentos, y después se deriva a una persona.**
--  3. Si el worker se cortaba DESPUÉS de mandar y ANTES de cerrar el trabajo, el rescate lo
--     volvía a poner pendiente y el turno corría de cero: Lucía pensaba de nuevo (nunca piensa
--     dos veces lo mismo) y el cliente recibía una segunda respuesta, distinta.
--
-- Para (3), la decisión aprobada por Mateo es **separar pensar de mandar**:
--
--   · `cola_trabajos.respondido_at` se pone cuando el turno ya guardó sus mensajes, ANTES de
--     mandarlos. Si el trabajo se reintenta y esto ya tiene valor, el worker NO vuelve a correr
--     el turno: retoma mandando lo que quedó sin salir.
--   · `mensajes.enviando_at` se pone justo antes de llamar a Meta. Si el worker se despierta y
--     encuentra un mensaje con enviando_at y sin wa_message_id, no sabe si salió o no: en la
--     duda NO lo manda de nuevo (mejor que falte uno a que el cliente lo reciba dos veces) y la
--     charla se deriva a una persona, que ve el hilo y decide.
--
-- `fallo_tecnico` es el motivo de derivación de los dos casos: se agotaron los intentos, o un
-- mensaje quedó en duda. No es culpa del cliente ni una decisión de Lucía: la charla necesita
-- que la mire alguien.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

alter table cola_trabajos add column if not exists respondido_at timestamptz;
alter table cola_trabajos add column if not exists reintentar_despues_de timestamptz;
comment on column cola_trabajos.reintentar_despues_de is
  'Antes de este instante el trabajo no se vuelve a tomar. Sin esta espera los 2 intentos se gastaban uno detrás del otro en la misma corrida del worker, y un corte de segundos en Meta derivaba la charla al pedo.';
comment on column cola_trabajos.respondido_at is
  'Cuándo el turno terminó de pensar y guardó sus mensajes. Con valor, un reintento no vuelve a correr el turno: solo termina de mandar lo que quedó sin salir.';

alter table mensajes add column if not exists enviando_at timestamptz;
comment on column mensajes.enviando_at is
  'Cuándo se empezó a mandar por Meta. Con enviando_at y sin wa_message_id, el envío quedó en duda: no se reintenta y la charla se deriva.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'derivaciones_motivo_check' and pg_get_constraintdef(oid) like '%fallo_tecnico%'
  ) then
    alter table derivaciones drop constraint if exists derivaciones_motivo_check;
    alter table derivaciones add constraint derivaciones_motivo_check
      check (motivo in ('reclamo', 'cliente_enojado', 'prenda_danada', 'corporativo', 'turno_urgente_sin_hueco',
        'evento_inminente', 'descuento', 'dato_no_encontrado', 'pide_persona',
        'barandilla_doble', 'sin_respuesta', 'timeout', 'fallo_tecnico'));
  end if;
end $$;

-- Deriva la charla de un trabajo que no se pudo resolver. Una sola derivación pendiente por
-- charla: si ya hay una sin atender, no se apila otra.
create or replace function cola_derivar_por_fallo(p_conversacion uuid, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversaciones set estado = 'derivada' where id = p_conversacion and estado = 'activa';
  if not exists (
    select 1 from derivaciones
     where conversacion_id = p_conversacion and motivo = 'fallo_tecnico' and estado = 'pendiente'
  ) then
    insert into derivaciones (conversacion_id, motivo) values (p_conversacion, 'fallo_tecnico');
  end if;
  insert into eventos_agente (conversacion_id, tipo, detalle)
  values (p_conversacion, 'error', jsonb_build_object('etapa', 'cola', 'error', p_detalle, 'derivada', true));
end;
$$;

revoke all on function cola_derivar_por_fallo(uuid, text) from public, anon, authenticated;
grant execute on function cola_derivar_por_fallo(uuid, text) to service_role;

-- MAX_INTENTOS = 2 (decisión de Mateo, 16/9): dos intentos de respuesta y, si no puede, a una
-- persona. Antes eran 3 y el trabajo quedaba abandonado en 'error'.
create or replace function cola_terminar(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_conversacion uuid;
  v_intentos integer;
begin
  if p_ok then
    update cola_trabajos set estado = 'hecho', procesado_at = now() where id = p_id;
    return;
  end if;
  -- En un UPDATE, `intentos` del lado derecho es el valor de antes. La espera de 30 s evita que
  -- los dos intentos se gasten seguidos en la misma corrida: el cron de contención lo levanta
  -- al minuto.
  update cola_trabajos
     set intentos = intentos + 1,
         estado = case when intentos + 1 >= 2 then 'error' else 'pendiente' end,
         tomado_por = null,
         tomado_at = null,
         reintentar_despues_de = now() + interval '30 seconds',
         payload = payload || jsonb_build_object('ultimo_error', p_error)
   where id = p_id
  returning conversacion_id, intentos into v_conversacion, v_intentos;

  if v_intentos >= 2 then
    perform cola_derivar_por_fallo(
      v_conversacion,
      coalesce(p_error, 'el trabajo falló dos veces') || ' (se agotaron los 2 intentos)'
    );
  end if;
end;
$$;

-- El rescate de los trabados usa el mismo tope y la misma salida a una persona.
create or replace function cola_rescatar_trabados()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_rescatados integer;
  f record;
begin
  for f in
    update cola_trabajos
       set intentos = intentos + 1,
           estado = case when intentos + 1 >= 2 then 'error' else 'pendiente' end,
           tomado_por = null,
           tomado_at = null
     where estado = 'procesando' and tomado_at < now() - interval '5 minutes'
    returning conversacion_id, intentos
  loop
    if f.intentos >= 2 then
      perform cola_derivar_por_fallo(f.conversacion_id, 'el trabajo quedó trabado y se agotaron los 2 intentos');
    end if;
  end loop;
  get diagnostics v_rescatados = row_count;
  return v_rescatados;
end;
$$;

-- cola_tomar_uno (0027) con la espera entre intentos: un trabajo que acaba de fallar no se vuelve
-- a tomar hasta que pase reintentar_despues_de. El resto es igual que en 0027.
create or replace function cola_tomar_uno(p_worker text)
returns setof cola_trabajos
language plpgsql
set search_path = public
as $$
declare
  v_fila cola_trabajos;
begin
  for v_fila in
    select * from cola_trabajos
     where estado = 'pendiente'
       and coalesce(reintentar_despues_de, '-infinity'::timestamptz) <= now()
     order by creado_at
     for update skip locked
  loop
    continue when not pg_try_advisory_xact_lock(hashtext('cola_trabajos:' || v_fila.conversacion_id::text));
    continue when exists (
      select 1 from cola_trabajos
       where conversacion_id = v_fila.conversacion_id and estado = 'procesando'
    );
    update cola_trabajos
       set estado = 'procesando', tomado_por = p_worker, tomado_at = now()
     where id = v_fila.id
    returning * into v_fila;
    return next v_fila;
    return;
  end loop;
end;
$$;
