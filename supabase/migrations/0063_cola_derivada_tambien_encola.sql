-- 0063_cola_derivada_tambien_encola.sql — cierra el agujero que dejó el arreglo del 21/9.
--
-- QUÉ PASÓ. El 21/9 Mateo pidió que una charla derivada dejara de ser muda: que Lucía siga
-- contestando salvo que el cliente se enoje o pida hablar con una persona (supuesto #47). Eso se
-- implementó en el worker (2e5019b: saca el corte por `conv.estado !== 'activa'` y le pasa
-- `yaDerivada` al turno) y en el turno (agente: MOTIVOS_DE_SILENCIO_DERIVADA). Las dos mitades
-- están bien.
--
-- Lo que NADIE tocó fue esta función, que es la única que encola el mensaje de un cliente. Y
-- seguía con la regla vieja: si la charla está 'derivada', no insertaba nada en cola_trabajos.
-- Sin fila en la cola no hay trabajo, sin trabajo el trigger no despierta al worker, y el arreglo
-- del worker no llega a correr NUNCA por el camino real. Lucía quedaba exactamente igual de muda
-- que antes, con todo el código de arriba diciendo que estaba arreglado.
--
-- POR QUÉ NO SE VIO. Tres cosas lo taparon a la vez, y las tres se arreglan aparte de esto:
--   · worker/atender.test.ts montaba el escenario al revés — mandaba el mensaje con la charla
--     ACTIVA (ahí sí encolaba) y recién después la marcaba 'derivada'. Probaba la carrera de que
--     alguien tome la charla mientras el worker espera quietud, no el caso real.
--   · tests/sql/run.mjs afirmaba el comportamiento VIEJO ("con la charla derivada, el mensaje se
--     guarda pero Lucía no recibe trabajo") y pasaba en verde, confirmando lo contrario de lo que
--     se había pedido.
--   · el emulador (probar-agente) también corta con 'derivada', así que los guiones tampoco lo
--     veían.
--
-- EL ARREGLO. Se encola igual con la charla 'derivada'. Quién se calla y quién no lo decide el
-- turno, que es donde vive esa regla (cliente_enojado o pedido explícito de una persona) y donde
-- Mateo la puede cambiar sin tocar la base. Acá solo se deja de decidir por él.
--
-- 'cerrada' SIGUE sin encolar, a propósito: una charla cerrada no se reabre sola — con un mensaje
-- nuevo, el insert de más arriba abre una conversación nueva (el índice único es sobre
-- estado in ('activa','derivada')), así que ese mensaje entra por la conversación nueva, ya
-- 'activa', y encola por la vía normal.
--
-- Idempotente: es un create or replace, correrla dos veces deja lo mismo.
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

  -- Activa o derivada: las dos encolan (pedido de Mateo, 21/9 — supuesto #47). Con la charla
  -- derivada el worker corre el turno igual, avisado con `yaDerivada`, y es el turno el que
  -- decide callarse si el cliente se enojó o pidió hablar con una persona. Antes esta compuerta
  -- decidía por él y el arreglo del worker no llegaba a correr nunca.
  -- La excepción del botón "Confirmo" queda igual: confirmar un turno es código, no una respuesta
  -- de Lucía, y tiene que funcionar incluso con la charla cerrada.
  if v_estado in ('activa', 'derivada')
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
