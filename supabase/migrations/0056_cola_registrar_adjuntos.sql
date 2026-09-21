-- 0056_cola_registrar_adjuntos.sql — que el media id de Meta quede guardado desde el momento en
-- que el mensaje entra, y no dependa de que alguien lo rescate después.
--
-- 0055 abrió las columnas de adjuntos en `mensajes` y rellenó lo que ya había llegado leyendo
-- cola_trabajos.payload. Pero eso fue un rescate de una sola vez: de acá en adelante, un audio
-- nuevo entraría otra vez con las columnas en null, porque registrar_mensaje_entrante nunca las
-- tocó. Esta migración cierra esa puerta.
--
-- POR QUÉ ACÁ Y NO EN EL WORKER. El worker ve el payload del trabajo que está procesando, pero
-- una ráfaga se contesta junta: varios mensajes del cliente se absorben en un solo turno. Si el
-- media id se copiara desde el worker, los mensajes absorbidos —que tienen su fila pero cuyo
-- trabajo no se procesó— quedarían sin id, y sin id no hay descarga ni reintento posible.
-- registrar_mensaje_entrante es el único punto por donde pasan TODOS los mensajes entrantes, uno
-- por uno. Es el lugar correcto.
--
-- Es la función de 0021 con una sola diferencia: el insert en `mensajes` ahora completa también
-- adjunto_media_id, adjunto_mime, adjunto_voz y adjunto_estado. Todo lo demás —el alta del
-- cliente, la conversación, el dedup por wa_message_id, la excepción del botón "Confirmo" para
-- las charlas derivadas— queda igual, a propósito y carácter por carácter.
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
  v_medio jsonb;
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

  -- El bloque del medio, si el mensaje trae uno. Meta lo manda con el nombre del tipo ('audio',
  -- 'image'…) y adentro siempre viene `id`, que es el handle que dura ~30 días. La URL que
  -- también trae NO se guarda: vence a los cinco minutos y guardarla sería guardar basura.
  v_medio := coalesce(p_crudo -> 'audio', p_crudo -> 'image', p_crudo -> 'sticker',
                      p_crudo -> 'video', p_crudo -> 'document');

  insert into mensajes (conversacion_id, wa_message_id, direccion, tipo, contenido, enviado_at,
                        adjunto_media_id, adjunto_mime, adjunto_voz, adjunto_estado)
  values (v_conversacion, p_wa_message_id, 'entrante', p_tipo, p_contenido, coalesce(p_enviado_at, now()),
          v_medio ->> 'id',
          v_medio ->> 'mime_type',
          (v_medio ->> 'voice')::boolean,
          -- 'pendiente' solo si hay algo que bajar. Sin id queda null, que es lo que exige la
          -- restricción mensajes_adjunto_coherente_check de 0055: un estado sin id sería un
          -- pendiente que el worker reintentaría para siempre.
          case when v_medio ->> 'id' is not null then 'pendiente' end)
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

-- Los mismos permisos de siempre: solo las Edge Functions y el dueño de la función.
revoke execute on function registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) to service_role;
