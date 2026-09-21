-- 0057_cola_derivar_avisa_al_cliente.sql — que una derivación por falla técnica tampoco deje mudo
-- al cliente (pedido de Mateo, 19/9: "cada vez que se derive a un humano el agente tiene que
-- enviar un mensaje").
--
-- agente cubrió los 5 caminos donde deriva Lucía. Quedaban los dos que NO los decide nadie: los
-- que se disparan cuando algo se rompe. Los dos terminan en esta función:
--   · worker/atender.ts, retomarEnvio(): un mensaje quedó "en duda" (el proceso murió justo
--     mientras Meta lo mandaba). Marca todo como error_al_enviar, llama acá y hace return.
--   · cola_terminar() y cola_rescatar_trabados(): se agotaron los 2 intentos del trabajo. El
--     segundo lo dispara pg_cron, o sea que puede pasar sin ningún worker vivo.
-- Hasta hoy los dos derivaban en silencio: el cliente escribía, no recibía nada, y solo se
-- enteraba quien mirara la Bandeja.
--
-- POR QUÉ EL AVISO SE ENCOLA Y NO SE MANDA. Lo natural sería mandar el texto desde el worker, en
-- retomarEnvio. Pero ahí el mensaje se pierde justo cuando más falta hace: si Meta falla al
-- mandarlo, la excepción sube, el trabajo se reintenta, y en el reintento ya no hay nada "en duda"
-- (se acaba de marcar todo como error_al_enviar), así que esa rama no vuelve a correr nunca y el
-- aviso desaparece sin dejar rastro. Encolándolo acá, el aviso es una fila en la base: sobrevive a
-- que el proceso se muera, lo reintenta la cola sola, y sirve para los dos caminos con un solo
-- cambio — porque los dos pasan por esta función.
--
-- Y sirve además para el caso más feo, el de cola_rescatar_trabados: ahí no hay worker al cual
-- pedirle nada. El aviso queda encolado esperando, y sale cuando el worker revive. No hay forma de
-- hacer mejor que eso: no existe ningún camino de Postgres a Meta que no pase por una Edge
-- Function propia.
--
-- SE REUSA EL CAMINO DEL MOSTRADOR. Las dos filas (el mensaje + el trabajo con tipo 'mostrador')
-- son el mismo contrato que usa mostrador_enviar (0028) para el equipo escribiendo desde el panel,
-- y el worker ya lo sabe despachar. Se eligió eso en vez de llamar a mostrador_enviar directamente
-- por una razón concreta: esa función LANZA EXCEPCIÓN si la ventana de 24 hs está cerrada, y una
-- excepción acá abortaría la transacción entera — nos quedaríamos sin derivación, sin el marcado
-- de los mensajes y sin el evento. O sea que el intento de avisar rompería justo lo que hoy sí
-- funciona. Insertando las filas a mano, si la ventana está cerrada el worker lo marca
-- 'ventana_cerrada' y no manda nada, que es la degradación correcta.
--
-- EL PREFIJO «[mostrador] » NO ES COSMÉTICO. Es lo que excluye a este mensaje del update de acá
-- arriba (línea `contenido not like '[mostrador] %'`) y del mismo filtro en retomarEnvio. Sin él,
-- la próxima llamada a esta función marcaría el aviso como error_al_enviar antes de que llegue a
-- salir. El worker saca el prefijo antes de mandarlo, así que el cliente nunca lo ve.
-- Efecto conocido y aceptado: en el panel el aviso se va a ver como un mensaje del mostrador, no
-- del sistema. No inventamos una marca nueva porque tocaría el worker, el panel y la bandeja; y
-- como la charla queda 'derivada', Lucía no vuelve a leerla para decidir nada.
--
-- EL TEXTO tiene un respaldo en código. Sale de contexto_agente, como todos los textos fijos, pero
-- si la fila no existe usa uno igual. Esto no es paranoia: las claves de derivación se sembraron a
-- mano el 19/9 y NO están en ninguna migración, así que cualquier base nueva (un proyecto nuevo,
-- una branch de Supabase, un db reset) las tendría vacías — y el silencio volvería entero,
-- exactamente el bug que esto cierra. Un texto viejo es infinitamente mejor que ninguno.
create or replace function cola_derivar_por_fallo(p_conversacion uuid, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_derivo boolean := false;
  v_texto text;
  v_mensaje uuid;
begin
  update conversaciones set estado = 'derivada' where id = p_conversacion and estado = 'activa';

  -- Lo que Lucía pensó y nunca salió queda marcado, no invisible: si no, quien atiende lee la
  -- respuesta en la charla y cree que el cliente ya la recibió.
  --
  -- Los mensajes del mostrador NO: tienen su propio trabajo en la cola y van a salir solos. Si una
  -- persona escribió desde el panel mientras el trabajo de Lucía agotaba sus intentos, marcarle el
  -- mensaje como fallido sería avisarle que no llegó algo que el cliente va a recibir igual.
  -- Desde 0057 esa misma exclusión protege al aviso automático de más abajo.
  update mensajes
     set no_enviado_motivo = 'error_al_enviar'
   where conversacion_id = p_conversacion
     and direccion = 'saliente'
     and wa_message_id is null
     and no_enviado_motivo is null
     and contenido not like '[mostrador] %';

  if not exists (
    select 1 from derivaciones
     where conversacion_id = p_conversacion and motivo = 'fallo_tecnico' and estado = 'pendiente'
  ) then
    insert into derivaciones (conversacion_id, motivo) values (p_conversacion, 'fallo_tecnico');
    v_derivo := true;
  end if;
  insert into eventos_agente (conversacion_id, tipo, detalle)
  values (p_conversacion, 'error', jsonb_build_object('etapa', 'cola', 'error', p_detalle, 'derivada', true));

  -- El aviso al cliente va SOLO si esta llamada abrió una derivación nueva. Ese "solo" es el freno
  -- de la recursión: el trabajo de envío que se encola acá abajo también pasa por cola_terminar, y
  -- si fallara dos veces volvería a esta función. Como para entonces ya hay una derivación
  -- pendiente, v_derivo queda en false y no se encola otro aviso. Sin este guard, una charla con
  -- la ventana vencida generaría avisos sin parar.
  if not v_derivo then
    return;
  end if;

  select valor into v_texto from contexto_agente where clave = 'texto_derivacion_fallo';
  if v_texto is null or btrim(v_texto) = '' then
    v_texto := 'Se me complicó de este lado. Ya avisé a alguien del local y en un rato te escriben.';
  end if;

  insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at)
  values (p_conversacion, 'saliente', 'texto', '[mostrador] ' || v_texto, clock_timestamp())
  returning id into v_mensaje;

  -- El trigger trg_disparar_worker (0020) se despierta con este insert y postea al worker. Si el
  -- worker está muerto, la fila espera: la levanta el cron worker-contencion, que cada minuto
  -- busca trabajos pendientes.
  insert into cola_trabajos (conversacion_id, payload)
  values (p_conversacion, jsonb_build_object('tipo', 'mostrador', 'mensaje_id', v_mensaje, 'autor', 'sistema'));
end;
$$;

revoke all on function cola_derivar_por_fallo(uuid, text) from public, anon, authenticated;
grant execute on function cola_derivar_por_fallo(uuid, text) to service_role;

-- Las dos claves de derivación que agente sembró a mano el 19/9, ahora en una migración: una base
-- levantada solo desde migraciones tenía estos textos vacíos y derivaba muda. El texto de reclamo
-- lo lee _shared/turno/turno.ts; el de fallo, esta función y turno.ts.
insert into contexto_agente (clave, valor) values
  ('texto_derivacion_reclamo', 'Te leo. Esto lo sigue alguien del local: en un rato te escriben.'),
  ('texto_derivacion_fallo',   'Se me complicó de este lado. Ya avisé a alguien del local y en un rato te escriben.')
on conflict (clave) do nothing;
