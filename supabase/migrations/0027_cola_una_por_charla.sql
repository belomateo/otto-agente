-- Hito 2.1 (Lucía en el worker real, decisión #15 del 15/9): la cola y los mensajes, listos
-- para que conteste Lucía en vez del stub.
--
-- 1) Un solo turno por charla a la vez. Cada mensaje encola un trabajo y dispara el worker: si
--    el cliente manda dos seguidos, dos workers correrían el turno sobre la misma ráfaga y le
--    llegarían dos respuestas. cola_tomar_uno ya no entrega el trabajo de una charla que tiene
--    otro 'procesando'. Si dos workers eligen trabajos de la misma charla a la vez, el lock de
--    transacción por charla deja pasar a uno solo; el exists, que en READ COMMITTED mira la base
--    de nuevo, ve el 'procesando' que el otro ya confirmó.
-- 2) cola_absorber: el turno contesta todo lo que el cliente escribió hasta el momento en que
--    arrancó (la ráfaga, AGENTE.md § 3 paso 3, _shared/turno/rafaga.ts). Los trabajos
--    pendientes de esos mismos mensajes quedan hechos con él; los de mensajes que llegaron
--    después, o que no son texto (el botón "Confirmo"), siguen en la cola.
-- 3) mensajes.tipo en castellano: el webhook guardaba el tipo de Meta ('text') y el turno y el
--    panel leen 'texto'. Desde ahora el webhook lo traduce (_shared/whatsapp/parsear.ts); acá se
--    corrigen las filas que ya estaban.

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

-- Mismo filtro que agruparRafaga: entrantes de texto, con contenido, enviados hasta p_hasta.
create or replace function cola_absorber(p_trabajo uuid, p_hasta timestamptz)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_absorbidos integer;
begin
  update cola_trabajos o
     set estado = 'hecho',
         procesado_at = now(),
         payload = o.payload || jsonb_build_object('absorbido_por', p_trabajo)
    from cola_trabajos t, mensajes m
   where t.id = p_trabajo
     and o.conversacion_id = t.conversacion_id
     and o.id <> t.id
     and o.estado = 'pendiente'
     and o.payload ? 'mensaje_id'
     and m.id = (o.payload ->> 'mensaje_id')::uuid
     and m.direccion = 'entrante'
     and m.tipo = 'texto'
     and m.contenido is not null
     and m.enviado_at <= p_hasta;
  get diagnostics v_absorbidos = row_count;
  return v_absorbidos;
end;
$$;

update mensajes set tipo = 'texto' where tipo = 'text';

-- Solo el service_role (las Edge Functions) y el dueño (el worker se conecta con
-- SUPABASE_DB_URL, tests/sql). cola_tomar_uno conserva los permisos de 0020.
revoke execute on function cola_absorber(uuid, timestamptz) from public, anon, authenticated;
grant execute on function cola_absorber(uuid, timestamptz) to service_role;
