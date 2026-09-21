-- 0058_cola_adjunto_reintentar.sql — el botón "reintentar" de un adjunto que no se pudo bajar.
--
-- Cuando el worker no puede bajar un audio o una foto de Meta, la fila queda en
-- adjunto_estado = 'error' con el motivo (0055). Eso es recuperable: el media id de Meta sigue
-- guardado y sirve ~30 días, así que basta con volver a intentarlo. Lo que faltaba era desde
-- dónde: `mensajes` solo la escribe service_role (0007), así que el panel no puede hacer el
-- UPDATE por su cuenta. Esta función es ese permiso, acotado.
--
-- POR QUÉ ADEMÁS ENCOLA UN TRABAJO. Poner el estado en 'pendiente' no alcanza: el worker baja
-- adjuntos pendientes solo cuando está atendiendo un trabajo de esa charla. Sin encolar nada,
-- alguien apretaría "reintentar", no pasaría nada visible, y el archivo aparecería recién cuando
-- el cliente escribiera de nuevo — que puede ser nunca.
--
-- Y POR QUÉ UN TIPO NUEVO Y NO UN TRABAJO NORMAL. Un trabajo común hace que Lucía PIENSE y
-- conteste. Acá el cliente no dijo nada nuevo: contestarle otra vez porque alguien del local
-- apretó un botón sería mandarle un mensaje que no pidió. El tipo 'adjuntos' solo baja lo que
-- está pendiente y termina: no piensa, no escribe, no deriva.
create or replace function adjunto_reintentar(p_mensaje uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversacion uuid;
  v_estado text;
begin
  -- Mismo criterio que mostrador_enviar (0028): sin JWT es una conexión directa a la base (el
  -- worker, tests/sql), que ya tiene la clave. Por la API, PostgREST siempre pone el JWT —
  -- también para anon— así que ahí pasan el service_role y un usuario aprobado del panel.
  if not (auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or es_usuario_aprobado()) then
    raise exception 'No tenés permiso para esto' using errcode = '42501';
  end if;

  select conversacion_id, adjunto_estado into v_conversacion, v_estado
    from mensajes where id = p_mensaje;

  if v_conversacion is null then
    raise exception 'Ese mensaje no existe' using errcode = 'P0002';
  end if;
  if v_estado is null then
    raise exception 'Ese mensaje no tiene ningún adjunto' using errcode = '55003';
  end if;
  -- Solo desde 'error'. Reintentar uno que ya está 'listo' volvería a bajarlo por nada y, peor,
  -- le borraría la transcripción que ya tenía. Y uno en 'pendiente' ya está en la fila: decir
  -- "ya_estaba" es más honesto que fingir que se hizo algo.
  if v_estado <> 'error' then
    return jsonb_build_object('ya_estaba', true, 'estado', v_estado);
  end if;

  update mensajes
     set adjunto_estado = 'pendiente', adjunto_detalle = null
   where id = p_mensaje and adjunto_estado = 'error';

  -- El trigger trg_disparar_worker (0020) despierta al worker con este insert. Si está caído,
  -- la fila espera y la levanta el cron worker-contencion.
  insert into cola_trabajos (conversacion_id, payload)
  values (v_conversacion, jsonb_build_object('tipo', 'adjuntos', 'mensaje_id', p_mensaje));

  return jsonb_build_object('ya_estaba', false, 'estado', 'pendiente');
end;
$$;

-- La llama el panel con la sesión de la persona, no el service_role: por eso va a authenticated
-- y el chequeo de es_usuario_aprobado() está adentro. anon no, nunca.
revoke all on function adjunto_reintentar(uuid) from public, anon;
grant execute on function adjunto_reintentar(uuid) to authenticated, service_role;
