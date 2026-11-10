-- 0114_seguimiento_sin_doble_aviso.sql — 10/11, análisis de conversión (pedido de Mateo).
--
-- 1) Doble aviso. El primer recontacto (plantilla) sale a las 11:05 del día siguiente; el seguimiento de 23 hs
--    (texto libre) sale 23 horas después del último mensaje del cliente. Quien escribía de tarde recibía el
--    recontacto a la mañana y el seguimiento unas horas después: de 131 seguimientos, 82 llegaron con un
--    recontacto en las 24 hs anteriores (64 en menos de 8) y esos contestaron menos (3 de 29, contra 5 de 20).
--    Ahora el seguimiento no mira a una charla a la que ya le salió un recontacto después de su último mensaje
--    (la inversa ya estaba en 0111: con el seguimiento enviado no sale el primer recontacto).
-- 2) seguimiento_candidatos informa la fecha del evento, para que el texto la nombre.
-- Los textos nuevos del seguimiento van aparte, en 0115: se aplican DESPUÉS de publicar cron-envios, que es quien
-- reemplaza {evento}; con la función vieja saldría escrito tal cual.
-- Idempotente.

drop function if exists public.seguimiento_candidatos(timestamptz);

create function public.seguimiento_candidatos(p_ahora timestamp with time zone default now())
 returns table(referencia uuid, cliente_id uuid, telefono text, nombre text, ultimo_cliente timestamptz,
               busco_horarios boolean, tiene_fecha boolean, fecha_evento date)
 language sql
 stable
 set search_path to 'public'
as $function$
  select co.id, co.cliente_id, c.telefono, c.nombre, u.ultimo,
         exists (select 1 from eventos_agente ev
                  where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
                    and ev.detalle->>'herramienta' = 'buscar_horarios' and (ev.detalle->>'ok')::boolean),
         c.fecha_evento is not null,
         c.fecha_evento
    from conversaciones co
    join clientes c on c.id = co.cliente_id
    join lateral (
      select m.direccion, m.contenido from mensajes m
       where m.conversacion_id = co.id order by m.enviado_at desc limit 1
    ) ult on true
    join lateral (
      select max(m.enviado_at) as ultimo from mensajes m
       where m.conversacion_id = co.id and m.direccion = 'entrante'
    ) u on true
   where co.estado = 'activa' and co.lucia_activa and co.canal <> 'prueba' and u.ultimo is not null
     and ult.direccion = 'saliente'
     and coalesce(ult.contenido, '') not like '[mostrador]%'
     and coalesce(ult.contenido, '') not like 'Perdón la demora%'
     and not exists (
       select 1 from mensajes m
        where m.conversacion_id = co.id and m.direccion = 'saliente'
          and m.contenido like '[mostrador]%' and m.enviado_at > u.ultimo)
     and u.ultimo <= p_ahora - interval '11 hours'
     and u.ultimo >  p_ahora - interval '24 hours' + interval '5 minutes'
     and c.telefono !~ '^5490000000'
     and not exists (
       select 1 from turnos t
        where t.cliente_id = co.cliente_id
          and t.estado not in ('cancelado', 'no-vino')
          and (t.creado_at >= co.iniciado_at or (t.estado in ('sin-confirmar', 'confirmado') and t.fin > p_ahora)))
     and not exists (
       select 1 from turnos t
        where t.cliente_id = co.cliente_id
          and t.estado in ('alquilo', 'retiro', 'devolvio')
          and t.inicio > p_ahora - interval '60 days')
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
          and ev.detalle->>'herramienta' = 'enviar_link'
          and ev.detalle->'argumentos'->>'tipo' = 'web-venta')
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'pensamiento'
          and ev.detalle->>'etapa' = 'seguimiento' and ev.creado_at > u.ultimo)
     -- 10/11: sin doble aviso, ver arriba.
     and not exists (
       select 1 from envios_programados e
        where e.tipo in ('recontacto_1', 'recontacto_2') and e.referencia = co.id and e.estado = 'enviado'
          and e.enviado_at > u.ultimo)
     and envio_disponible('seguimiento_23h', co.id);
$function$;

revoke execute on function public.seguimiento_candidatos(timestamptz) from public, anon, authenticated;
