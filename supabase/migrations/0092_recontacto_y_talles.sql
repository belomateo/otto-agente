-- Dos correcciones de la revisión del 8/10 (charlas desde la actualización del 7/10).
--
-- 1. Recontacto: no a quien dijo que escribió por error o que no le interesa. Caso real (8/10):
--    alguien que había escrito «FUE SIN QUERER» recibió al día siguiente «¿todavía estás buscando
--    traje para tu evento?». El momento del recontacto NO se toca: los datos del 8/10 dicen que el
--    del día siguiente funciona (respondieron 4 de 11; los de tres días, 0 de 16), y a quien cierra
--    con «ok, gracias» tampoco se lo excluye (uno de ellos volvió a preguntar el precio). Igual a
--    0088 salvo la condición nueva, marcada con 8/10.
-- 2. Talles: la ficha del negocio dice «del XS al 68 de saco», pero el fragmento solo decía «del XS
--    al 4XL, por letra»: a «¿tenés talle 62?» Lucía contestó que «no equivale a nuestra
--    numeración». Idempotente: solo cambia el texto si todavía no lo dice.

-- 1. Recontacto.
create or replace function public.envios_pendientes(p_tipo text, p_tz text, p_ahora timestamp with time zone default now())
 returns table(referencia uuid, cliente_id uuid, telefono text, nombre text, inicio timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $function$
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
  -- Recontactos (supuesto #27): charlas que siguen con Lucía (activa y con Lucía prendida), cuyo
  -- último mensaje del cliente fue ayer (recontacto_1) o hace tres días (recontacto_2, solo si salió
  -- el primero y el cliente no contestó), sin turno desde que empezaron, sin un turno activo por
  -- venir, sin un alquiler reciente y que no sean de venta.
  select co.id, co.cliente_id, c.telefono, c.nombre, null::timestamptz
    from conversaciones co
    join clientes c on c.id = co.cliente_id
    join lateral (
      select max(m.enviado_at) as ultimo from mensajes m
       where m.conversacion_id = co.id and m.direccion = 'entrante'
    ) u on true, decente
   where decente.ok
     and p_tipo in ('recontacto_1', 'recontacto_2')
     and co.estado = 'activa' and co.lucia_activa and u.ultimo is not null
     and (u.ultimo at time zone p_tz)::date
         = (p_ahora at time zone p_tz)::date - (case when p_tipo = 'recontacto_1' then 1 else 3 end)
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
     and (p_tipo = 'recontacto_1' or exists (
       select 1 from envios_programados e
        where e.tipo = 'recontacto_1' and e.referencia = co.id and e.estado = 'enviado'
          and u.ultimo < e.enviado_at))
     and not exists (
       select 1 from eventos_agente ev
        where ev.conversacion_id = co.id and ev.tipo = 'herramienta'
          and ev.detalle->>'herramienta' = 'enviar_link'
          and ev.detalle->'argumentos'->>'tipo' = 'web-venta')
     -- 8/10: no a quien dijo que escribió por error o que no le interesa (ver el encabezado).
     and not exists (
       select 1 from mensajes m
        where m.conversacion_id = co.id and m.direccion = 'entrante'
          and m.enviado_at >= u.ultimo - interval '30 minutes'
          and lower(concat_ws(' ', m.contenido, m.transcripcion)) ~
              '(sin querer|por error|me equivoqu|equivocad|no era (para|a) (vos|ustedes|este|esta|aca|acá)|no me interesa|ya no (lo |la )?necesito|ya (consegu|alquil|compr)|^\s*no,? gracias)')
     and envio_disponible(p_tipo, co.id);
$function$;

-- 2. Talles.
update fragmentos
   set texto = replace(texto, 'Los talles de adultos van por letra.',
                 'Los talles de adultos van por letra; en número de saco llegan hasta el 68, así que un talle dicho en número (50, 56, 62) también se trabaja.'),
       version = version + 1,
       editado_por = 'claude-code 8/10: talles en número hasta el 68'
 where tema = 'talles' and titulo = 'Talles'
   and texto like '%Los talles de adultos van por letra.%'
   and texto not like '%hasta el 68%';
