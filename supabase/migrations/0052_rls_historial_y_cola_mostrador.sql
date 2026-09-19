-- 0052_rls_historial_y_cola_mostrador.sql — dos hallazgos de la auditoría del 17/9.
--
-- 1. HISTORIAL (seguridad). 0007 le dio a cualquier perfil aprobado lectura de TODA la tabla
--    historial_ediciones, y `datos_anteriores` es `to_jsonb(OLD)`: la fila entera de la versión
--    anterior. O sea que todo lo que 0045 y 0040 cerraron a la dueña —precios del catálogo, el
--    texto del prompt, las reglas, el conocimiento— seguía saliendo entero por la puerta de atrás:
--    un empleado con su propio token pedía historial_ediciones?tabla=eq.catalogo_alquiler y se
--    llevaba los precios de todos los modelos; con tabla=eq.prompt_base, el prompt completo.
--
--    El principio: el historial de una fila es tan sensible como la fila. Así que el equipo ve el
--    historial exactamente de las tablas que ya puede leer —clientes y turnos, que son su trabajo
--    diario, más las de la agenda que Turnos necesita para armar la grilla— y todo lo demás es de
--    la dueña. El panel no se rompe: su handler ya filtra por entidad.
--
-- 2. COLA. cola_derivar_por_fallo (0046) marca como «no salió» todo mensaje saliente sin wamid de
--    la charla. Pero si mientras el trabajo de Lucía esperaba su reintento alguien del local
--    contestó desde el panel, ese mensaje todavía está en la cola esperando su propio trabajo y SÍ
--    va a salir: marcarlo es mentirle a quien atiende, que ve «no se envió» sobre algo que el
--    cliente va a recibir igual. Se le pone la misma exclusión que ya usa el worker.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

drop policy if exists historial_ediciones_lectura_aprobados on historial_ediciones;
drop policy if exists historial_ediciones_lectura on historial_ediciones;
create policy historial_ediciones_lectura on historial_ediciones for select
  using (
    es_admin()
    or (
      es_usuario_aprobado()
      -- Las mismas que el equipo puede leer en la tabla original (0045 de paneles).
      and tabla in ('clientes', 'turnos', 'horarios', 'franjas_turnos', 'duraciones_turno', 'configuracion_agenda')
    )
  );

comment on table historial_ediciones is
  'Versión anterior de cada fila editada. datos_anteriores es la fila ENTERA: quien lee el historial de una tabla lee su contenido. Por eso la policy de lectura sigue a la de la tabla original y no al revés.';

create or replace function cola_derivar_por_fallo(p_conversacion uuid, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversaciones set estado = 'derivada' where id = p_conversacion and estado = 'activa';

  -- Lo que Lucía pensó y nunca salió queda marcado, no invisible: si no, quien atiende lee la
  -- respuesta en la charla y cree que el cliente ya la recibió.
  --
  -- Los mensajes del mostrador NO: tienen su propio trabajo en la cola y van a salir solos. Si una
  -- persona escribió desde el panel mientras el trabajo de Lucía agotaba sus intentos, marcarle el
  -- mensaje como fallido sería avisarle que no llegó algo que el cliente va a recibir igual.
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
  end if;
  insert into eventos_agente (conversacion_id, tipo, detalle)
  values (p_conversacion, 'error', jsonb_build_object('etapa', 'cola', 'error', p_detalle, 'derivada', true));
end;
$$;

revoke all on function cola_derivar_por_fallo(uuid, text) from public, anon, authenticated;
grant execute on function cola_derivar_por_fallo(uuid, text) to service_role;
