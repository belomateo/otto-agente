-- Responder desde el panel (PROCESOS.md § 4, paso 6; hito 2.1): el equipo escribe en una charla
-- que tomó y el mensaje sale por WhatsApp desde el worker, que es el único que tiene la clave de
-- Meta. mostrador_enviar lo guarda en la charla con la marca «[mostrador] » al principio (así lo
-- lee Lucía en el historial, _shared/turno/historial.ts, y así lo reconoce el panel) y encola un
-- trabajo {tipo: 'mostrador'}; el trigger de 0020 despierta al worker, que lo manda sin la marca.
--
-- La llama paneles (POST /api/bandeja/<id>/mensajes) con la sesión de quien escribe. Es security
-- definer porque `mensajes` y `cola_trabajos` son tablas de sistema (solo lectura para el panel),
-- con el chequeo de usuario aprobado adentro.
-- Errores: 42501 sin permiso; P0002 si la charla no existe; 55000 si no está tomada ('derivada')
-- o si pasaron más de 24 hs desde el último mensaje del cliente (WhatsApp solo acepta una
-- plantilla); 22023 si el texto queda vacío o pasa los 4000 caracteres.

create or replace function mostrador_enviar(p_conversacion uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_estado text;
  v_ultimo timestamptz;
  v_autor text;
  v_mensaje uuid;
begin
  -- Sin JWT es una conexión directa a la base (el worker, tests/sql), que ya tiene la clave de la
  -- base. Por la API (PostgREST siempre pone el JWT, también para anon) pasan el service_role y un
  -- usuario aprobado del panel.
  if not (auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or es_usuario_aprobado()) then
    raise exception 'Sin permiso para responder desde el panel' using errcode = '42501';
  end if;
  if v_texto = '' or length(v_texto) > 4000 then
    raise exception 'El mensaje no puede quedar vacío ni pasar los 4000 caracteres' using errcode = '22023';
  end if;

  select estado into v_estado from conversaciones where id = p_conversacion for update;
  if not found then
    raise exception 'Esa charla no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'derivada' then
    raise exception 'Tomá la charla antes de responder desde el panel' using errcode = '55000';
  end if;

  select max(enviado_at) into v_ultimo
    from mensajes where conversacion_id = p_conversacion and direccion = 'entrante';
  if v_ultimo is null or v_ultimo < now() - interval '24 hours' then
    raise exception 'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp solo deja mandar una plantilla'
      using errcode = '55000';
  end if;

  select u.email into v_autor from auth.users u where u.id = auth.uid();

  insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at)
  values (p_conversacion, 'saliente', 'texto', '[mostrador] ' || v_texto, clock_timestamp())
  returning id into v_mensaje;

  insert into cola_trabajos (conversacion_id, payload)
  values (p_conversacion, jsonb_build_object('tipo', 'mostrador', 'mensaje_id', v_mensaje, 'autor', v_autor));

  return jsonb_build_object('mensaje_id', v_mensaje, 'estado', 'encolado');
end;
$$;

revoke execute on function mostrador_enviar(uuid, text) from public, anon;
grant execute on function mostrador_enviar(uuid, text) to authenticated, service_role;
