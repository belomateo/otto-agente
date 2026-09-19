-- 0048_cola_mostrador_foto.sql — decisión #15 de Mateo (16/9): «se debería poder mandar fotos
-- desde derivación». El hermano de mostrador_enviar (0028), para una foto en vez de un texto.
--
-- Por qué no es un link como las del catálogo. Las fotos del catálogo viven en el bucket
-- `catalogo`, que es público, y salen por link (enviarImagen). Estas no: las sube alguien del
-- equipo desde el panel al bucket `adjuntos`, que es privado a propósito —es la foto de un
-- cliente probándose, o la de un traje con un arreglo— y hacerla pública para que Meta la baje
-- sería publicar la foto de un cliente en una URL adivinable, para siempre. Así que el worker la
-- baja con su propia clave, la sube a /media de WhatsApp y la manda por media_id. Nada queda
-- expuesto y Meta la borra sola a los 30 días.
--
-- El epígrafe, si lo hay, sale como un mensaje de texto aparte y no como caption de la foto: así
-- queda una fila de `mensajes` por cada mensaje de WhatsApp (un wa_message_id, un aviso de
-- estado) y el panel muestra exactamente lo que le llegó al cliente. Además Lucía lo lee: el
-- historial que arma _shared/turno/historial.ts toma solo las filas de tipo 'texto', así que la
-- foto le es invisible pero el epígrafe marcado «[mostrador] » no.
--
-- Errores, igual que 0028: 42501 sin permiso; P0002 si la charla no existe o la foto no está en
-- el bucket; 55000 si la charla no está tomada o pasaron más de 24 hs; 22023 si el archivo no es
-- una imagen, pesa más de lo que acepta Meta o el epígrafe pasa los 1000 caracteres.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

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
  -- El panel puede mandar «adjuntos/xxx.jpg» o «xxx.jpg»: se guarda siempre sin el bucket.
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
  -- Sin JWT es una conexión directa a la base (el worker, tests/sql), que ya tiene la clave de la
  -- base. Por la API pasan el service_role y un usuario aprobado del panel.
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
  -- Lo que acepta la Cloud API de WhatsApp para type=image: jpeg o png, hasta 5 MB.
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

  select u.email into v_autor from auth.users u where u.id = auth.uid();

  -- Igual que las fotos que manda Lucía (worker/atender.ts): tipo 'imagen' y en `contenido` dónde
  -- está la foto. Acá es la ruta dentro de `adjuntos`, no un link, porque el bucket es privado.
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
