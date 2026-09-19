-- 0055_storage_medios_entrantes.sql — que los audios y las fotos que manda el cliente se puedan
-- escuchar y ver desde el CRM, y que Lucía los pueda leer (pedido de Mateo, 19/9).
--
-- Hoy un audio entra a `mensajes` con tipo='audio' y contenido=null, y ahí muere: el turno lo
-- detecta como "soloNoTexto" y contesta el texto fijo texto_mensaje_no_soportado ("todavía no
-- puedo leer fotos, audios ni stickers"). El archivo en sí nunca se baja. Estas columnas son el
-- lugar donde queda una vez bajado.
--
-- POR QUÉ HAY QUE BAJARLO Y NO LINKEARLO. Meta manda en el webhook una URL directa al archivo,
-- pero vence rápido: en el único audio real que había llegado hasta el 19/9, el
-- parámetro `ext` de esa URL daba exactamente 302 segundos después del timestamp del mensaje.
-- Cinco minutos. Una charla que el equipo abre al otro día tendría el link muerto. Por eso el
-- archivo se copia a nuestro Storage y todo lo que muestra el panel sale de ahí.
--
-- POR QUÉ SE GUARDA TAMBIÉN EL MEDIA ID. Aparte de la URL que vence, Meta da un id estable que
-- sirve para pedir una URL nueva durante ~30 días. Ese id es el que permite REINTENTAR una
-- descarga que falló, y es lo único que no se puede reconstruir después. Hoy vive únicamente
-- dentro de cola_trabajos.payload, que es una tabla de trabajo y se limpia: si no lo copiamos
-- acá, cada descarga fallida es una pérdida definitiva. Es la columna más importante de todas.
--
-- BUCKET. Se reusa `adjuntos` (0008), privado, con RLS es_usuario_aprobado() en select/insert/
-- update/delete (0008 y 0025). No se crea un bucket nuevo a propósito: esa política es
-- exactamente la que queremos —lo ve el equipo aprobado y nadie más— y un bucket nuevo
-- significaría auditar cuatro políticas más sin ganar nada. Los medios del cliente van bajo el
-- prefijo `entrantes/<conversacion_id>/`, separados de las fotos que sube el local.
--
-- PRIVACIDAD. Desde que esto ande, la nota de voz y la foto de un cliente quedan guardadas en
-- nuestra infraestructura por tiempo indefinido. Hoy no hay política de retención y no la invento
-- acá: queda anotado como decisión pendiente de Mateo (¿se borran a los X meses?). Lo que sí
-- queda cubierto es el acceso: el bucket es privado y hace falta ser usuario aprobado.

alter table mensajes
  -- El id estable de Meta. Sirve ~30 días para pedir una URL nueva: es el handle de reintento.
  add column if not exists adjunto_media_id text,
  -- Ruta dentro del bucket `adjuntos`, SIN el prefijo del bucket (misma convención que 0048).
  add column if not exists adjunto_path text,
  -- Tal cual lo manda Meta, con parámetros incluidos: 'audio/ogg; codecs=opus'. Se guarda entero
  -- porque el navegador lo usa para elegir decodificador; la extensión se deriva aparte.
  add column if not exists adjunto_mime text,
  add column if not exists adjunto_bytes integer,
  -- true = nota de voz (apretó el micrófono), false = archivo de audio adjunto. Meta los
  -- distingue y para el que atiende son dos cosas distintas, así que el panel las puede separar.
  add column if not exists adjunto_voz boolean,
  -- Duración en segundos. NO viene en el webhook (verificado contra el payload real): se calcula
  -- al bajar el archivo, y puede quedar en null si no se pudo leer el contenedor. Nada depende
  -- de que exista.
  add column if not exists adjunto_segundos integer,
  add column if not exists adjunto_estado text,
  -- Por qué falló, para que el panel muestre algo mejor que "error" y para poder diagnosticar.
  add column if not exists adjunto_detalle text,
  -- Lo que se entendió del audio. Lo llena el agente después de transcribir. Es texto generado
  -- por una máquina: el panel tiene que mostrarlo como tal y nunca como cita textual del cliente.
  add column if not exists transcripcion text;

alter table mensajes drop constraint if exists mensajes_adjunto_estado_check;
alter table mensajes add constraint mensajes_adjunto_estado_check
  check (adjunto_estado is null or adjunto_estado in ('pendiente', 'listo', 'error'));

-- Sin media_id no hay nada que bajar: un estado sin id sería un pendiente eterno que el worker
-- reintentaría para siempre. Se prohíbe la combinación en vez de confiar en que el código no la
-- escriba.
alter table mensajes drop constraint if exists mensajes_adjunto_coherente_check;
alter table mensajes add constraint mensajes_adjunto_coherente_check
  check (adjunto_estado is null or adjunto_media_id is not null);

-- Un adjunto 'listo' sin ruta sería invisible para el panel: se pediría la URL firmada de algo
-- que no está. Mejor que la base lo rechace a que aparezca un reproductor vacío.
alter table mensajes drop constraint if exists mensajes_adjunto_listo_check;
alter table mensajes add constraint mensajes_adjunto_listo_check
  check (adjunto_estado is distinct from 'listo' or adjunto_path is not null);

-- La cola del worker: qué falta bajar. Parcial para que pese casi nada — la enorme mayoría de
-- los mensajes son de texto y tienen adjunto_estado en null.
create index if not exists mensajes_adjunto_pendiente_idx on mensajes (conversacion_id)
  where adjunto_estado = 'pendiente';

-- Para reintentar los que fallaron, desde el panel o a mano.
create index if not exists mensajes_adjunto_error_idx on mensajes (enviado_at desc)
  where adjunto_estado = 'error';

-- ── Relleno de lo que ya llegó ───────────────────────────────────────────────────────────────
-- Los medios que entraron ANTES de esta migración tienen su media id todavía vivo dentro de
-- cola_trabajos.payload, y Meta los guarda ~30 días. O sea: son recuperables, pero solo por un
-- rato y solo si copiamos el id ahora. Al 19/9 esto alcanza un único mensaje real (un audio de
-- una charla en curso), pero el costo de hacerlo es cero y el de no hacerlo es perderlo.
--
-- Solo escribe columnas nuevas que hoy están todas en null y solo sobre filas que no tienen
-- adjunto_media_id: es idempotente y no puede pisar nada existente. No toca contenido, ni
-- tipo, ni nada que ya estuviera.
with medios as (
  select
    (t.payload ->> 'mensaje_id')::uuid                                as mensaje_id,
    coalesce(t.payload -> 'mensaje' -> 'audio', t.payload -> 'mensaje' -> 'image',
             t.payload -> 'mensaje' -> 'video', t.payload -> 'mensaje' -> 'document',
             t.payload -> 'mensaje' -> 'sticker')                     as medio
  from cola_trabajos t
  where t.payload ? 'mensaje_id'
    and t.payload -> 'mensaje' ->> 'type' in ('audio', 'image', 'video', 'document', 'sticker')
)
update mensajes m
   set adjunto_media_id = medios.medio ->> 'id',
       adjunto_mime     = medios.medio ->> 'mime_type',
       adjunto_voz      = (medios.medio ->> 'voice')::boolean,
       adjunto_estado   = 'pendiente'
  from medios
 where m.id = medios.mensaje_id
   and m.adjunto_media_id is null
   and medios.medio ->> 'id' is not null;
