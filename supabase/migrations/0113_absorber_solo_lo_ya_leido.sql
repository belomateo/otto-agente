-- 8/11: Mariela escribió "El 7/12" mientras Lucía contestaba el mensaje anterior y nadie le
-- contestó (Gisela, 7/11, igual). cola_absorber daba por contestado todo trabajo cuyo mensaje
-- tuviera enviado_at <= el arranque del turno, pero enviado_at es la hora de Meta (en segundos
-- redondos) y el mensaje puede entrar a nuestra base DESPUÉS de que el turno ya leyó la charla.
-- Ahora el trabajo además tiene que haberse creado antes del arranque del turno: si ya estaba en
-- la cola, el turno lo vio. Si llegó después, se queda pendiente y tiene su propio turno.
-- (El peor caso es al revés y no pierde nada: un trabajo ya leído que corre de nuevo y no
-- encuentra nada nuevo que contestar.)

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
     and o.creado_at <= p_hasta
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

revoke execute on function cola_absorber(uuid, timestamptz) from public, anon, authenticated;
grant execute on function cola_absorber(uuid, timestamptz) to service_role;
