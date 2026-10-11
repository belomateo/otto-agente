-- 0104_corrector_de_lucia.sql — el corrector de Lucía. Pedido de Mateo (10/10): «una sub-pestaña
-- dentro de la Bitácora, solo para administradores, para cambiar las instrucciones de Lucía sin
-- programador». El admin escribe qué quiere cambiar; la función `corrector` lee las instrucciones,
-- las herramientas y las fichas, dice qué lo contradice y propone dos opciones (editar una parte o
-- agregar información); el admin elige, el cambio se arma, se verifica y se prueba con charlas
-- invisibles (adentro de una transacción que termina en rollback: nada queda en el CRM ni sale por
-- WhatsApp). Solo si la prueba da 100% se aplica. Si no, no cambia nada.
--
-- Decisión de Mateo del 10/10: las instrucciones vuelven a vivir en la base, para que el corrector
-- las pueda editar. Pero no como antes del 9/10 (prompt_base, que cualquiera editaba y que una vez
-- quedó en 47 caracteres): acá hay versiones, una sola activa, y la única forma de que una pase a
-- activa es el corrector con su prueba al 100% (lo cuidan el check de la tabla, corrector_aplicar
-- y que nadie más que la función pueda escribir). El worker lee la versión activa primero y, si no
-- hay o no pasa sus controles de cordura, el prompt.md publicado (worker/prompt.ts).
--
-- Qué trae:
--   1. correcciones_lucia: un pedido del admin y todo lo que pasó con él (análisis, opción elegida,
--      el cambio armado, el resultado, el costo, quién y cuándo).
--   2. correcciones_pruebas: las charlas de prueba de cada corrección, con lo que tenía que hacer
--      Lucía, lo que contestó y el veredicto del juez.
--   3. instrucciones_lucia: las versiones de las instrucciones (el texto completo). Una sola activa.
--   4. RLS: solo un admin lee; nadie escribe desde el panel. Escribe la función, con su conexión
--      directa a la base (como el worker y el analista), y las dos funciones de abajo para volver
--      atrás o descartar, que exigen ser admin.
--   5. corrector_aplicar / corrector_rechazar: el cierre de una prueba, en una sola sentencia. Se
--      hace acá y no con begin/commit desde la función a propósito: la prueba con el modelo real corre
--      todo adentro de una transacción que termina en rollback, y un commit ahí la confirmaría.
--   6. instrucciones_volver / correccion_descartar: lo que hace el admin desde el panel.
--
-- Sin claves foráneas a tablas que ya existen (perfiles, fragmentos, herramientas_agente): crear una
-- toma un candado sobre la tabla referida mientras dura la transacción, y las pruebas de esta
-- migración corren contra la base real adentro de una transacción. Quién pidió cada cosa queda como
-- texto (el mail) y su id.
--
-- Idempotente: correrla dos veces no falla ni duplica nada. La aplica Mateo a mano; el panel puede
-- salir antes (la sub-pestaña dice que falta activarlo mientras las tablas no existan) y el worker
-- también (si la tabla no está, sigue con el prompt.md como hasta ahora).

-- 1. Correcciones -----------------------------------------------------------------------------------
create table if not exists correcciones_lucia (
  id uuid primary key default gen_random_uuid(),
  -- Lo que escribió el admin, tal cual.
  pedido text not null check (length(btrim(pedido)) between 3 and 2000),
  -- analizada: el modelo leyó el pedido y propuso las opciones; falta que el admin elija.
  -- probando: eligió una, el cambio se armó y corren las charlas de prueba.
  -- aplicada: la prueba dio 100% y el cambio quedó (Lucía lo usa en menos de un minuto).
  -- rechazada: la prueba no dio 100%, o algo cambió mientras se probaba: Lucía sigue igual.
  -- descartada: el admin la dejó sin aplicar.
  estado text not null default 'analizada'
    check (estado in ('analizada', 'probando', 'aplicada', 'rechazada', 'descartada')),
  -- Lo que entendió el modelo, lo que lo contradice (con la cita textual) y las dos opciones, ya
  -- validado en código (corrector/analisis.ts).
  analisis jsonb not null,
  -- De qué instrucciones se partió (origen, versión, huellas): para mostrarlo y para avisar si
  -- cambiaron.
  base jsonb not null default '{}'::jsonb,
  opcion text check (opcion in ('editar', 'agregar')),
  destino text check (destino in ('instrucciones', 'ficha', 'herramienta')),
  -- El cambio armado (corrector/candidata.ts): la parte de antes, la nueva y, en una ficha o una
  -- herramienta, el texto completo que se escribe si la prueba pasa. Es exactamente lo que se probó.
  cambio jsonb,
  -- Por qué se aplicó o no, dicho para una persona.
  resultado text,
  pruebas_total int not null default 0,
  pruebas_ok int not null default 0,
  modelo text,
  -- Todo lo que costó: el análisis, las pruebas (las charlas de Lucía también) y el juez.
  costo_usd numeric(10, 4) not null default 0,
  pedida_por text,
  pedida_por_id uuid,
  creada_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now(),
  terminada_at timestamptz,
  -- Elegir una opción es elegir qué se cambia: sin el cambio armado no hay nada que probar.
  constraint correcciones_lucia_opcion_con_cambio check (
    estado in ('analizada', 'descartada') or (opcion is not null and destino is not null and cambio is not null)
  )
);

create index if not exists correcciones_lucia_creada_idx on correcciones_lucia (creada_at desc);

comment on table correcciones_lucia is
  'Corrector de Lucía (0104): cada pedido de un admin para cambiar cómo atiende Lucía, con el análisis, la opción elegida, el cambio probado y el resultado. Lo escribe la función corrector; se ve en Bitácora › Corrector.';

-- 2. Pruebas: una charla de prueba por fila ---------------------------------------------------------
create table if not exists correcciones_pruebas (
  id uuid primary key default gen_random_uuid(),
  correccion_id uuid not null references correcciones_lucia(id) on delete cascade,
  orden int not null check (orden > 0),
  -- Qué prueba, en pocas palabras («pregunta si hay estacionamiento»).
  nombre text not null,
  -- Lo que escribe el cliente: un elemento por turno (un texto, o varios seguidos).
  mensajes jsonb not null,
  -- Con qué datos arranca el cliente de prueba (evento, fecha del evento), si hace falta.
  ficha jsonb,
  debe jsonb not null,
  no_debe jsonb not null default '[]'::jsonb,
  -- pendiente → corriendo → paso | fallo | error. salteada: no se corrió porque otra ya había
  -- fallado (el resultado ya estaba decidido: no se gasta de más).
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'corriendo', 'paso', 'fallo', 'error', 'salteada')),
  intentos int not null default 0,
  -- La charla como quedó: lo que escribió el cliente, lo que contestó Lucía y las herramientas que usó.
  charla jsonb,
  -- El juez, punto por punto, con el porqué.
  veredicto jsonb,
  motivo text,
  costo_usd numeric(10, 4) not null default 0,
  tomada_at timestamptz,
  terminada_at timestamptz,
  -- Además de ordenar, sirve de índice de la clave foránea (correccion_id va primero).
  constraint correcciones_pruebas_orden_unico unique (correccion_id, orden)
);

comment on table correcciones_pruebas is
  'Corrector de Lucía (0104): las charlas de prueba de cada corrección. Corren con el código real de Lucía adentro de una transacción que termina en rollback: no dejan nada en el CRM.';

-- 3. Versiones de las instrucciones -----------------------------------------------------------------
create table if not exists instrucciones_lucia (
  id uuid primary key default gen_random_uuid(),
  -- 1, 2, 3… También las rechazadas: son parte de la historia.
  version int not null check (version > 0),
  -- El texto completo, tal cual lo lee Lucía. El piso es de cordura (el 16/9 la plantilla de la base
  -- quedó en 47 caracteres): los controles de verdad los hace el código (_shared/instrucciones.ts).
  texto text not null check (length(texto) >= 2000),
  -- borrador: se está probando · activa: la que usa Lucía (una sola) · rechazada: no pasó la prueba
  -- (o se descartó) · reemplazada: estuvo activa y ya no.
  estado text not null default 'borrador'
    check (estado in ('borrador', 'activa', 'rechazada', 'reemplazada')),
  correccion_id uuid references correcciones_lucia(id) on delete set null,
  -- El pedido que la originó (copia: la corrección se puede borrar, la historia de la versión no).
  pedido text,
  resumen text not null,
  -- De qué texto salió: el prompt.md publicado, otra versión del corrector o la copia vieja de la
  -- base (prompt_vigente, solo si faltaba el archivo).
  base_origen text not null check (base_origen in ('archivo', 'corrector', 'base')),
  base_version int,
  -- Huella (sha-256) del prompt.md que tenía la función al armarla: si un programador publica otro
  -- archivo, el corrector avisa que esta versión no lo trae.
  hash_archivo text,
  -- Si es una vuelta atrás, la versión que copia.
  restaurada_de int,
  -- Pasó la prueba al 100%. Sin esto no puede estar activa (check de abajo).
  prueba_ok boolean not null default false,
  -- Resumen de la prueba: cuántas charlas, cuántas pasaron, de qué corrección.
  prueba jsonb,
  creada_por text,
  creada_at timestamptz not null default now(),
  activada_at timestamptz,
  desactivada_at timestamptz,
  desactivada_por text,
  motivo_desactivacion text,
  constraint instrucciones_lucia_version_unica unique (version),
  constraint instrucciones_lucia_base_coherente check (
    (base_origen = 'corrector') = (base_version is not null)
  ),
  constraint instrucciones_lucia_activa_probada check (estado <> 'activa' or (prueba_ok and activada_at is not null))
);

-- Una sola activa a la vez.
create unique index if not exists instrucciones_lucia_una_activa on instrucciones_lucia ((true)) where estado = 'activa';
create index if not exists instrucciones_lucia_correccion_idx on instrucciones_lucia (correccion_id) where correccion_id is not null;

comment on table instrucciones_lucia is
  'Corrector de Lucía (0104): las versiones de las instrucciones de Lucía (el texto completo). Una sola activa; solo llega a activa una versión que pasó su prueba al 100%. Sin ninguna activa, Lucía usa el prompt.md publicado (worker/prompt.ts).';

-- 4. RLS y permisos ---------------------------------------------------------------------------------
-- Solo un admin lee (es lo que Lucía piensa por dentro y lleva el costo, igual que la Bitácora). Nadie
-- escribe con la sesión del panel: escribe la función corrector con la conexión directa, que no pasa
-- por la RLS, y las funciones de la sección 6, que exigen ser admin.
alter table correcciones_lucia enable row level security;
alter table correcciones_pruebas enable row level security;
alter table instrucciones_lucia enable row level security;

drop policy if exists correcciones_lucia_lectura_admin on correcciones_lucia;
create policy correcciones_lucia_lectura_admin on correcciones_lucia for select to authenticated
  using ((select es_admin()));
drop policy if exists correcciones_pruebas_lectura_admin on correcciones_pruebas;
create policy correcciones_pruebas_lectura_admin on correcciones_pruebas for select to authenticated
  using ((select es_admin()));
drop policy if exists instrucciones_lucia_lectura_admin on instrucciones_lucia;
create policy instrucciones_lucia_lectura_admin on instrucciones_lucia for select to authenticated
  using ((select es_admin()));

revoke all on correcciones_lucia, correcciones_pruebas, instrucciones_lucia from anon, authenticated;
grant select on correcciones_lucia, correcciones_pruebas, instrucciones_lucia to authenticated;

-- 5. El cierre de una prueba (lo llama la función, nunca el panel) ------------------------------------

-- Rechazar: la corrección queda rechazada con el porqué, su versión borrador (si era de las
-- instrucciones) también, y las charlas que no llegaron a correr quedan salteadas. Lucía sigue igual.
create or replace function corrector_rechazar(p_correccion uuid, p_motivo text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_filas int;
begin
  update correcciones_lucia
     set estado = 'rechazada', resultado = left(p_motivo, 2000), terminada_at = now(), actualizada_at = now(),
         pruebas_total = (select count(*) from correcciones_pruebas where correccion_id = p_correccion),
         pruebas_ok = (select count(*) from correcciones_pruebas where correccion_id = p_correccion and estado = 'paso')
   where id = p_correccion and estado = 'probando';
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false; -- ya estaba cerrada (otra llamada llegó antes, o el admin la descartó)
  end if;
  update instrucciones_lucia
     set estado = 'rechazada', motivo_desactivacion = left(p_motivo, 2000)
   where correccion_id = p_correccion and estado = 'borrador';
  update correcciones_pruebas
     set estado = 'salteada', motivo = 'No se corrió: la prueba ya no podía dar 100%.', terminada_at = now()
   where correccion_id = p_correccion and estado = 'pendiente';
  return true;
end;
$$;

-- Aplicar: solo con todas las charlas en «paso» (y al menos tres), y solo si lo que se cambia sigue
-- como estaba cuando se armó el cambio. Si otra corrección se aplicó mientras esta se probaba (o un
-- programador publicó otro prompt.md, o alguien editó la ficha), esta se armó sobre algo viejo y
-- aplicarla pisaría ese cambio: se rechaza con el porqué. Todo en una sola sentencia: o queda todo o
-- no queda nada.
-- p_hash_archivo: la huella del prompt.md que tiene la función ahora.
create or replace function corrector_aplicar(p_correccion uuid, p_quien text, p_hash_archivo text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  c correcciones_lucia%rowtype;
  v_total int;
  v_ok int;
  v_nueva instrucciones_lucia%rowtype;
  v_activa instrucciones_lucia%rowtype;
  v_hay_activa boolean;
  v_filas int;
  v_id uuid;
  v_motivo text;
  v_resultado text;
begin
  select * into c from correcciones_lucia where id = p_correccion for update;
  if not found then
    raise exception 'corrector_aplicar: la corrección % no existe', p_correccion using errcode = 'P0002';
  end if;
  if c.estado <> 'probando' then
    return jsonb_build_object('aplicada', false, 'motivo', format('la corrección ya estaba %s', c.estado), 'cerrada', true);
  end if;

  select count(*), count(*) filter (where estado = 'paso') into v_total, v_ok
    from correcciones_pruebas where correccion_id = p_correccion;
  -- El código ya lo decidió (corrector/pruebas.ts, decidir); esto es la segunda llave.
  if v_total < 3 or v_ok <> v_total then
    raise exception 'corrector_aplicar: la prueba no dio 100%% (% de %)', v_ok, v_total using errcode = '23514';
  end if;

  if c.destino = 'instrucciones' then
    select * into v_nueva from instrucciones_lucia where correccion_id = p_correccion and estado = 'borrador' for update;
    if not found then
      raise exception 'corrector_aplicar: la corrección % no tiene una versión en borrador', p_correccion using errcode = 'P0002';
    end if;
    select * into v_activa from instrucciones_lucia where estado = 'activa' for update;
    v_hay_activa := found;
    if v_nueva.base_origen = 'corrector' then
      if not v_hay_activa or v_activa.version <> v_nueva.base_version then
        v_motivo := format('Las instrucciones cambiaron mientras se probaba (se armó sobre la versión %s y ahora rige %s): volvé a pedirlo.',
                           v_nueva.base_version, coalesce('la versión ' || v_activa.version, 'el archivo publicado'));
      end if;
    elsif v_hay_activa then
      v_motivo := format('Las instrucciones cambiaron mientras se probaba (ahora rige la versión %s): volvé a pedirlo.', v_activa.version);
    elsif v_nueva.base_origen = 'archivo' and v_nueva.hash_archivo is distinct from p_hash_archivo then
      v_motivo := 'Se publicó otro archivo de instrucciones mientras se probaba: volvé a pedirlo.';
    end if;
    if v_motivo is null then
      update instrucciones_lucia
         set estado = 'reemplazada', desactivada_at = now(), desactivada_por = p_quien,
             motivo_desactivacion = format('La reemplazó la versión %s.', v_nueva.version)
       where estado = 'activa';
      update instrucciones_lucia
         set estado = 'activa', prueba_ok = true, activada_at = now(),
             prueba = jsonb_build_object('correccion_id', p_correccion, 'total', v_total, 'pasaron', v_ok)
       where id = v_nueva.id;
      v_resultado := format('Aplicado: Lucía usa la versión %s de sus instrucciones (las %s pruebas pasaron).', v_nueva.version, v_total);
    end if;

  elsif c.destino = 'ficha' then
    if (c.cambio #>> '{ficha,id}') is null then
      insert into fragmentos (tema, titulo, texto, editado_por)
      values (c.cambio #>> '{ficha,tema}', c.cambio #>> '{ficha,titulo}', c.cambio #>> '{ficha,texto_nuevo}', p_quien)
      returning id into v_id;
      v_resultado := format('Aplicado: se cargó la ficha «%s» (las %s pruebas pasaron).', c.cambio #>> '{ficha,titulo}', v_total);
    else
      update fragmentos
         set texto = c.cambio #>> '{ficha,texto_nuevo}', editado_por = p_quien
       where id = (c.cambio #>> '{ficha,id}')::uuid and version = (c.cambio #>> '{ficha,version}')::int and activo;
      get diagnostics v_filas = row_count;
      if v_filas = 0 then
        v_motivo := format('La ficha «%s» cambió mientras se probaba: volvé a pedirlo.', c.cambio #>> '{ficha,titulo}');
      else
        v_resultado := format('Aplicado: se cambió la ficha «%s» (las %s pruebas pasaron).', c.cambio #>> '{ficha,titulo}', v_total);
      end if;
    end if;

  elsif c.destino = 'herramienta' then
    update herramientas_agente
       set descripcion = c.cambio #>> '{herramienta,texto_nuevo}', editado_por = p_quien
     where nombre = c.cambio #>> '{herramienta,nombre}' and version = (c.cambio #>> '{herramienta,version}')::int;
    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      v_motivo := format('La herramienta %s cambió mientras se probaba: volvé a pedirlo.', c.cambio #>> '{herramienta,nombre}');
    else
      v_resultado := format('Aplicado: se cambió la descripción de %s (las %s pruebas pasaron).', c.cambio #>> '{herramienta,nombre}', v_total);
    end if;

  else
    raise exception 'corrector_aplicar: destino desconocido (%)', c.destino using errcode = '22023';
  end if;

  if v_motivo is not null then
    perform corrector_rechazar(p_correccion, v_motivo);
    return jsonb_build_object('aplicada', false, 'motivo', v_motivo);
  end if;

  update correcciones_lucia
     set estado = 'aplicada', resultado = v_resultado, pruebas_total = v_total, pruebas_ok = v_ok,
         terminada_at = now(), actualizada_at = now()
   where id = p_correccion;
  return jsonb_build_object('aplicada', true, 'resultado', v_resultado, 'version', v_nueva.version, 'fragmento_id', v_id);
end;
$$;

-- Las llama solo la función corrector (conexión directa): ningún rol de la API.
revoke all on function corrector_rechazar(uuid, text) from public, anon, authenticated;
revoke all on function corrector_aplicar(uuid, text, text) from public, anon, authenticated;

-- 6. Lo que hace el admin desde el panel ------------------------------------------------------------

-- Volver atrás. p_version null: volver al archivo publicado (ninguna versión activa; Lucía lee el
-- prompt.md). Con un número: volver a esa versión, que tiene que haber estado activa antes (o sea, que
-- pasó su prueba): se crea una versión nueva con el mismo texto, así la historia queda de corrido y
-- se sabe quién volvió atrás y cuándo. Lucía lo toma en menos de un minuto (la caché del worker).
create or replace function instrucciones_volver(p_version int default null)
returns jsonb
language plpgsql
security definer -- la tabla no se escribe con la sesión del panel; esto exige ser admin
set search_path = public
as $$
declare
  v_quien text := coalesce(nullif((select auth.jwt()) ->> 'email', ''), (select auth.uid())::text, 'sin sesión');
  v_activa instrucciones_lucia%rowtype;
  v_hay_activa boolean;
  v_destino instrucciones_lucia%rowtype;
  v_nueva int;
begin
  if not (select es_admin()) then
    raise exception 'instrucciones_volver: solo un admin puede volver atrás las instrucciones de Lucía' using errcode = '42501';
  end if;

  select * into v_activa from instrucciones_lucia where estado = 'activa' for update;
  v_hay_activa := found;

  if p_version is null then
    if not v_hay_activa then
      return jsonb_build_object('vigente', 'archivo', 'cambio', false);
    end if;
    update instrucciones_lucia
       set estado = 'reemplazada', desactivada_at = now(), desactivada_por = v_quien,
           motivo_desactivacion = 'Se volvió al archivo publicado.'
     where id = v_activa.id;
    return jsonb_build_object('vigente', 'archivo', 'cambio', true);
  end if;

  select * into v_destino from instrucciones_lucia where version = p_version;
  if not found then
    raise exception 'instrucciones_volver: no existe la versión %', p_version using errcode = 'P0002';
  end if;
  if v_destino.estado <> 'reemplazada' or not v_destino.prueba_ok then
    raise exception 'instrucciones_volver: solo se puede volver a una versión que estuvo activa (la % está %)', p_version, v_destino.estado
      using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into v_nueva from instrucciones_lucia;
  if v_hay_activa then
    update instrucciones_lucia
       set estado = 'reemplazada', desactivada_at = now(), desactivada_por = v_quien,
           motivo_desactivacion = format('Se volvió a la versión %s.', p_version)
     where id = v_activa.id;
  end if;
  -- La base de la copia es la de la versión original: «volver a la anterior» desde acá sigue para atrás.
  insert into instrucciones_lucia
    (version, texto, estado, pedido, resumen, base_origen, base_version, hash_archivo, restaurada_de,
     prueba_ok, prueba, creada_por, activada_at)
  values
    (v_nueva, v_destino.texto, 'activa', v_destino.pedido,
     left(format('Vuelta a la versión %s: %s', p_version, v_destino.resumen), 500),
     v_destino.base_origen, v_destino.base_version, v_destino.hash_archivo, p_version,
     true, v_destino.prueba, v_quien, now());
  return jsonb_build_object('vigente', 'corrector', 'version', v_nueva, 'cambio', true);
end;
$$;

-- Descartar una corrección que no terminó (el admin no quiere ninguna de las opciones, o cerró el
-- panel a mitad de la prueba). Lo que estaba en prueba no se aplica.
create or replace function correccion_descartar(p_correccion uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text := coalesce(nullif((select auth.jwt()) ->> 'email', ''), (select auth.uid())::text, 'sin sesión');
  v_filas int;
begin
  if not (select es_admin()) then
    raise exception 'correccion_descartar: solo un admin puede descartar una corrección' using errcode = '42501';
  end if;
  update correcciones_lucia
     set estado = 'descartada', resultado = format('La descartó %s sin aplicarla.', v_quien),
         terminada_at = now(), actualizada_at = now()
   where id = p_correccion and estado in ('analizada', 'probando');
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'correccion_descartar: esa corrección ya estaba cerrada' using errcode = '55000';
  end if;
  update instrucciones_lucia
     set estado = 'rechazada', motivo_desactivacion = 'Se descartó sin terminar la prueba.'
   where correccion_id = p_correccion and estado = 'borrador';
  update correcciones_pruebas
     set estado = 'salteada', motivo = 'No se corrió: la corrección se descartó.', terminada_at = now()
   where correccion_id = p_correccion and estado in ('pendiente', 'corriendo');
  return true;
end;
$$;

revoke all on function instrucciones_volver(int) from public, anon;
grant execute on function instrucciones_volver(int) to authenticated;
revoke all on function correccion_descartar(uuid) from public, anon;
grant execute on function correccion_descartar(uuid) to authenticated;

comment on function instrucciones_volver(int) is
  'Corrector de Lucía (0104): vuelve a una versión que estuvo activa (crea una nueva con su texto) o, con null, al prompt.md publicado. Solo admin.';
comment on function correccion_descartar(uuid) is
  'Corrector de Lucía (0104): descarta una corrección sin aplicarla. Solo admin.';
