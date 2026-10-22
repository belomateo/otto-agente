-- 0109_audios_y_respuestas_rapidas.sql — pedido de Sofía (22/10), dos cosas para el chat del CRM:
--
-- 1. MANDAR AUDIOS desde el panel. Mismo camino que la foto (0048/0090): el panel sube el audio
--    al bucket privado `adjuntos`, esta función lo encola con tipo 'mostrador_audio' y el worker
--    lo sube a /media de WhatsApp y lo manda por media_id. Mismas reglas que la foto: charla
--    tomada, ventana de 24 hs, y apaga a Lucía (si el equipo manda, está atendiendo).
--    Diferencia con la foto: el mensaje nace con adjunto_estado = 'listo' y su adjunto_path, así
--    el CRM lo reproduce igual que un audio del cliente (Adjunto.tsx + /api/medios/<id>).
--    adjunto_media_id lleva 'mostrador' porque 0055 exige un media id en todo adjunto con estado;
--    el worker lo pisa con el id real de Meta cuando lo sube.
--    Tipos: los que acepta WhatsApp Cloud API para audio (aac, amr, mpeg, mp4, ogg/opus). webm
--    NO: el panel ni siquiera lo ofrece, pero se frena acá igual por si le pegan directo.
--
-- 2. RESPUESTAS RÁPIDAS con "/" en el composer: textos compartidos por todo el equipo. Mismo
--    patrón que las tablas de Configuración (enlaces, 0014/0040): version + editado_por/at con
--    historial, autoría por trigger (0017), borrado al historial (0030). Leer: cualquier aprobado
--    (el equipo las usa en la Bandeja). Escribir: solo un admin (0040, "solo la dueña").
--
-- Idempotente.

-- ── 1. Audio desde el mostrador ─────────────────────────────────────────────────────────────

create or replace function mostrador_enviar_audio(p_conversacion uuid, p_storage_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text := regexp_replace(btrim(coalesce(p_storage_path, '')), '^/*(adjuntos/)?', '');
  v_estado text;
  v_ultimo timestamptz;
  v_autor text;
  v_mime text;
  v_bytes bigint;
  v_mensaje uuid;
begin
  if not (auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or es_usuario_aprobado()) then
    raise exception 'Sin permiso para mandar un audio desde el panel' using errcode = '42501';
  end if;
  if v_path = '' then
    raise exception 'Falta el audio' using errcode = '22023';
  end if;

  -- El mime sin parámetros: el navegador puede haberlo subido como 'audio/ogg;codecs=opus'.
  select lower(btrim(split_part(o.metadata ->> 'mimetype', ';', 1))), (o.metadata ->> 'size')::bigint
    into v_mime, v_bytes
    from storage.objects o
   where o.bucket_id = 'adjuntos' and o.name = v_path;
  if not found then
    raise exception 'Ese audio no está subido' using errcode = 'P0002';
  end if;
  if v_mime is null or v_mime not in ('audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/amr') then
    raise exception 'WhatsApp no acepta audios de tipo %', coalesce(v_mime, 'desconocido')
      using errcode = '22023';
  end if;
  if coalesce(v_bytes, 0) > 16 * 1024 * 1024 then
    raise exception 'El audio pesa % MB y WhatsApp acepta hasta 16', round(v_bytes / 1048576.0, 1)
      using errcode = '22023';
  end if;

  select estado into v_estado from conversaciones where id = p_conversacion for update;
  if not found then
    raise exception 'Esa charla no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'derivada' then
    raise exception 'Tomá la charla antes de mandar un audio desde el panel' using errcode = '55000';
  end if;

  select max(enviado_at) into v_ultimo
    from mensajes where conversacion_id = p_conversacion and direccion = 'entrante';
  if v_ultimo is null or v_ultimo < now() - interval '24 hours' then
    raise exception 'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp solo deja mandar una plantilla'
      using errcode = '55000';
  end if;

  -- Mismo criterio que mostrador_enviar (0090): si el equipo manda, está atendiendo.
  update conversaciones set lucia_activa = false where id = p_conversacion and lucia_activa;

  select u.email into v_autor from auth.users u where u.id = auth.uid();

  insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at,
                        adjunto_media_id, adjunto_path, adjunto_mime, adjunto_bytes, adjunto_voz, adjunto_estado)
  values (p_conversacion, 'saliente', 'audio', '[mostrador] ' || v_path, clock_timestamp(),
          'mostrador', v_path, v_mime, v_bytes, true, 'listo')
  returning id into v_mensaje;

  insert into cola_trabajos (conversacion_id, payload)
  values (p_conversacion, jsonb_build_object(
    'tipo', 'mostrador_audio',
    'mensaje_id', v_mensaje,
    'storage_path', v_path,
    'mime', v_mime,
    'autor', v_autor
  ));

  return jsonb_build_object('mensaje_id', v_mensaje, 'estado', 'encolado');
end;
$$;

revoke execute on function mostrador_enviar_audio(uuid, text) from public, anon;
grant execute on function mostrador_enviar_audio(uuid, text) to authenticated, service_role;

-- ── 2. Respuestas rápidas ───────────────────────────────────────────────────────────────────

create table if not exists respuestas_rapidas (
  id uuid primary key default gen_random_uuid(),
  atajo text not null,
  texto text not null,
  orden int not null default 0,
  activo boolean not null default true,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now(),
  creado_at timestamptz not null default now()
);

alter table respuestas_rapidas enable row level security;
drop policy if exists respuestas_rapidas_lectura on respuestas_rapidas;
create policy respuestas_rapidas_lectura on respuestas_rapidas for select using (es_usuario_aprobado());
drop policy if exists respuestas_rapidas_admin_escribe on respuestas_rapidas;
create policy respuestas_rapidas_admin_escribe on respuestas_rapidas for all
  using (es_admin()) with check (es_admin());

drop trigger if exists trg_historial on respuestas_rapidas;
create trigger trg_historial before update on respuestas_rapidas
  for each row execute function historial_antes_de_editar();
drop trigger if exists trg_historial_borrado on respuestas_rapidas;
create trigger trg_historial_borrado before delete on respuestas_rapidas
  for each row execute function historial_antes_de_borrar();
drop trigger if exists trg_autoria on respuestas_rapidas;
create trigger trg_autoria before insert or update on respuestas_rapidas
  for each row execute function autoria_de_sesion();

-- Las cinco primeras, con el texto que ya usa el negocio: fichas como-funciona/que-incluye/
-- ubicacion (seeds/fragmentos.sql, 0084, 0107), accesorios (seeds/catalogo_accesorios.sql),
-- catálogo online (docs/ficha-del-negocio.md) y mapa (seeds/contexto.sql). Solo si la tabla
-- está vacía: no pisa lo que la dueña ya haya cargado.
insert into respuestas_rapidas (atajo, texto, orden, editado_por)
select v.atajo, v.texto, v.orden, 'claude-code 22/10: respuestas rápidas iniciales (pedido de Sofía)'
  from (values
    ('como-funciona',
     'Te cuento cómo es el alquiler: primero venís al local con turno, el asesor te muestra modelos, te probás el que más te guste y te toma las medidas. Si lo alquilás, la sastrería lo ajusta a tu medida. El traje se retira un día antes del evento, con una prueba final para ver que esté perfecto, y se devuelve un día hábil después. En total te quedás con el traje 3 días. La tintorería corre por nuestra cuenta.',
     1),
    ('precios',
     'El alquiler arranca a partir de $150.000 e incluye el ambo (saco y pantalón) y el servicio de sastrería y tintorería antes y después del evento: lo recibís limpio, planchado y listo para usar. La camisa con corbata ($33.500) y los zapatos con cinturón ($55.000) se alquilan aparte, para completar el look.',
     2),
    ('catalogo',
     'Los modelos y colores de alquiler, con sus fotos, los podés ver en nuestro catálogo online: https://www.mrotto.com.ar/alquiler/',
     3),
    ('disponibilidad',
     'La disponibilidad de cada modelo depende del talle y de la fecha del evento, por eso se confirma en el local: en el turno te mostramos lo que hay para tu fecha, te lo probás y elegís con asesoramiento.',
     4),
    ('direccion',
     'Estamos en España 764, Rosario, entre Santa Fe y Córdoba. Te dejo la ubicación: https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8',
     5)
  ) as v(atajo, texto, orden)
 where not exists (select 1 from respuestas_rapidas);
