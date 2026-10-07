-- Caso real (Luciano, 7/10): el equipo estaba atendiendo la charla y alguien tocó sin querer
-- "Activar Lucía" en el panel. Cuando el cliente mandó el mensaje siguiente, Lucía contestó
-- y derivó — pisando al equipo que ya estaba hablando.
--
-- El arreglo: cada vez que el equipo manda un mensaje desde el panel (mostrador_enviar),
-- se apaga lucia_activa. Si están escribiendo, están atendiendo; Lucía no tiene que hablar.
-- Para devolverle la charla a Lucía, el equipo tiene el botón "Devolver a Lucía" (que
-- necesita la migración 0089 para encenderla de vuelta).
--
-- Idempotente: es un create or replace.

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

  -- Apagar a Lucía: si el equipo está escribiendo, están atendiendo. Esto cubre el caso
  -- de un toggle accidental (alguien tocó "Activar Lucía" sin querer). La fila ya está
  -- bloqueada por el FOR UPDATE de arriba, así que no hay carrera.
  update conversaciones set lucia_activa = false where id = p_conversacion and lucia_activa;

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

-- Lo mismo para fotos desde el panel (0048): si el equipo manda una foto, también está
-- atendiendo. Sin esto, un toggle accidental + foto = Lucía habla encima del equipo.
create or replace function mostrador_enviar_foto(
  p_conversacion uuid,
  p_storage_path text,
  p_epigrafe text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text := regexp_replace(btrim(coalesce(p_storage_path, '')), '^/*(adjuntos/)?', '');
  v_epigrafe text := nullif(btrim(coalesce(p_epigrafe, '')), '');
  v_estado text;
  v_ultimo timestamptz;
  v_autor text;
  v_mime text;
  v_bytes bigint;
  v_mensaje uuid;
  v_mensaje_epigrafe uuid;
begin
  if not (auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or es_usuario_aprobado()) then
    raise exception 'Sin permiso para mandar una foto desde el panel' using errcode = '42501';
  end if;
  if v_path = '' then
    raise exception 'Falta la foto' using errcode = '22023';
  end if;
  if v_epigrafe is not null and length(v_epigrafe) > 1000 then
    raise exception 'El epígrafe no puede pasar los 1000 caracteres' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into v_mime, v_bytes
    from storage.objects o
   where o.bucket_id = 'adjuntos' and o.name = v_path;
  if not found then
    raise exception 'Esa foto no está subida' using errcode = 'P0002';
  end if;
  if v_mime is null or v_mime not in ('image/jpeg', 'image/png') then
    raise exception 'WhatsApp solo acepta fotos jpg o png (esta es %)', coalesce(v_mime, 'de tipo desconocido')
      using errcode = '22023';
  end if;
  if coalesce(v_bytes, 0) > 5 * 1024 * 1024 then
    raise exception 'La foto pesa % MB y WhatsApp acepta hasta 5', round(v_bytes / 1048576.0, 1)
      using errcode = '22023';
  end if;

  select estado into v_estado from conversaciones where id = p_conversacion for update;
  if not found then
    raise exception 'Esa charla no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'derivada' then
    raise exception 'Tomá la charla antes de mandar una foto desde el panel' using errcode = '55000';
  end if;

  select max(enviado_at) into v_ultimo
    from mensajes where conversacion_id = p_conversacion and direccion = 'entrante';
  if v_ultimo is null or v_ultimo < now() - interval '24 hours' then
    raise exception 'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp solo deja mandar una plantilla'
      using errcode = '55000';
  end if;

  -- Mismo criterio que mostrador_enviar: si el equipo manda, está atendiendo.
  update conversaciones set lucia_activa = false where id = p_conversacion and lucia_activa;

  select u.email into v_autor from auth.users u where u.id = auth.uid();

  insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at)
  values (p_conversacion, 'saliente', 'imagen', '[mostrador] ' || v_path, clock_timestamp())
  returning id into v_mensaje;

  if v_epigrafe is not null then
    insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at)
    select p_conversacion, 'saliente', 'texto', '[mostrador] ' || v_epigrafe,
           greatest(clock_timestamp(), max(m.enviado_at) + interval '10 milliseconds')
      from mensajes m where m.conversacion_id = p_conversacion
    returning id into v_mensaje_epigrafe;
  end if;

  insert into cola_trabajos (conversacion_id, payload)
  values (p_conversacion, jsonb_build_object(
    'tipo', 'mostrador_foto',
    'mensaje_id', v_mensaje,
    'storage_path', v_path,
    'mime', v_mime,
    'epigrafe_mensaje_id', v_mensaje_epigrafe,
    'autor', v_autor
  ));

  return jsonb_build_object(
    'mensaje_id', v_mensaje,
    'epigrafe_mensaje_id', v_mensaje_epigrafe,
    'estado', 'encolado'
  );
end;
$$;

revoke execute on function mostrador_enviar_foto(uuid, text, text) from public, anon;
grant execute on function mostrador_enviar_foto(uuid, text, text) to authenticated, service_role;
