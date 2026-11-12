-- 0117_absorber_lo_leido.sql — 12/11. Gisela (11/11, 09:00): «Graduación» quedó sin respuesta. Su trabajo se
-- creó (creado_at = inicio de la transacción del webhook) una décima antes de que el worker tomara el turno,
-- así que 0113 lo dio por contestado; pero la transacción se confirmó después de que el turno leyó la charla
-- y Lucía nunca lo vio. Comparar horas no alcanza: ahora el worker manda la lista de mensajes que el turno
-- LEYÓ y se absorben solo los trabajos de esos mensajes. La versión de 2 argumentos (0113) queda para el
-- worker anterior y para cuando el turno no informa la lista.
-- Idempotente.

create or replace function cola_absorber(p_trabajo uuid, p_hasta timestamptz, p_leidos uuid[])
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
     and m.id = any(p_leidos)
     and m.direccion = 'entrante'
     and m.tipo = 'texto'
     and m.contenido is not null
     and m.enviado_at <= p_hasta;
  get diagnostics v_absorbidos = row_count;
  return v_absorbidos;
end;
$$;

revoke execute on function cola_absorber(uuid, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function cola_absorber(uuid, timestamptz, uuid[]) to service_role;
