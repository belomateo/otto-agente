-- 0050_base_prompt_vigente.sql — pedido de Mateo (16/9): «hacé que funcione la información que se
-- cambie, que el prompt principal esté en un .md así se puede modificar a gusto».
--
-- El problema. El prompt de Lucía YA es un .md, pero viaja horneado adentro de la función: se
-- arma cuando se publica (scripts/armar-prompt.mjs escribe _shared/prompt.md) y _shared/turno lo
-- lee una vez y lo cachea para siempre. O sea que la dueña puede editar el prompt, las reglas y
-- el contexto en el panel y Lucía sigue hablando igual hasta que un programador vuelva a
-- publicar. PROCESOS.md promete «≤ 60 s» y hoy es «nunca». Esto lo arregla.
--
-- Cómo queda. prompt_base.texto guarda la PLANTILLA —el .md con sus marcadores— que es lo que la
-- dueña edita (para eso la creó paneles en 0015, y quedó vacía desde entonces). prompt_vigente()
-- la completa con las reglas y el contexto que hay AHORA en la base y devuelve el prompt
-- terminado. El worker lo lee con una caché de un minuto: la dueña guarda, y al minuto Lucía ya
-- habla distinto.
--
-- Devuelve null —no un prompt a medias— si la plantilla no está, si queda algún marcador sin
-- resolver o si no empieza como tiene que empezar. El que llama se queda con el prompt.md que
-- viene en la función, que es el último que pasó las validaciones: Lucía nunca se queda muda ni
-- habla con un prompt roto.
--
-- Es un puerto de armar-prompt.mjs, que sigue siendo el que VALIDA una edición antes de guardarla
-- (ahí la dueña ve qué está mal y lo arregla) y el que genera el prompt.md de respaldo. Las dos
-- puntas tienen que dar lo mismo: hay un control que las compara carácter por carácter
-- (tests/sql/prompt-vigente.mjs).
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

-- Saca los comentarios HTML de la plantilla. Va buscando <!-- … --> de a uno en vez de con una
-- expresión regular porque Postgres no tiene cómo escribir esto: para que ^ signifique «principio
-- de línea» hace falta el flag n, y ese mismo flag impide que el punto (o una clase negada)
-- matchee un salto de línea, que es justo lo que necesita un comentario de varias líneas. Y la
-- clase [\s\S] que usa el generador en JavaScript en Postgres no existe: \S adentro de corchetes
-- es ilegal. Así queda explícito y no depende de ninguna sutileza del motor.
--
-- Un comentario que ocupa la línea entera se lleva la línea; uno en medio de una línea deja lo que
-- tiene al lado. Es lo mismo que hace limpiarPlantilla() en scripts/armar-prompt.mjs.
create or replace function prompt_sin_comentarios(p_texto text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  t text := coalesce(p_texto, '');
  ini int;
  fin int;
  izq text;
  der text;
begin
  loop
    ini := position('<!--' in t);
    exit when ini = 0;
    fin := position('-->' in substring(t from ini));
    exit when fin = 0;                  -- un <!-- sin cerrar: se deja como está
    fin := ini + fin + 1;               -- el último '>' del cierre
    izq := substring(t for ini - 1);
    der := substring(t from fin + 1);
    -- Si de la línea solo había espacios antes del comentario, se va la línea entera.
    if izq ~ '(^|\n)[ \t]*$' then
      izq := regexp_replace(izq, '[ \t]*$', '');
      der := regexp_replace(der, '^[ \t]*\n?', '');
    end if;
    t := izq || der;
  end loop;
  return t;
end;
$fn$;

-- Un valor de contexto_agente lo escribe la dueña como le sale: se deja en un solo bloque (sin
-- líneas en blanco adentro, que el prompt las usa para separar secciones) y con punto final si
-- termina en letra o número. Nada más: el texto es suyo. Espeja normalizarValorContexto().
create or replace function prompt_normalizar_contexto(p_valor text)
returns text
language sql
immutable
set search_path = public
as $fn$
  with limpio as (
    select btrim(replace(replace(coalesce(p_valor, ''), E'\r\n', E'\n'), E'\r', E'\n')) as v
  ),
  junto as (
    select regexp_replace(regexp_replace(v, '[ \t]+\n', E'\n', 'g'), E'\n{2,}', E'\n', 'g') as v from limpio
  )
  select case when v ~ '[[:alnum:]]$' then v || '.' else v end from junto;
$fn$;

-- Las reglas activas, numeradas y cada una en una sola línea. Espeja renderizarReglas().
create or replace function prompt_reglas_numeradas()
returns text
language sql
stable
set search_path = public
as $fn$
  select string_agg(
           r.numero || '. ' || btrim(regexp_replace(
             replace(replace(r.texto, E'\r\n', E'\n'), E'\r', E'\n'), '\s*\n\s*', ' ', 'g')),
           E'\n' order by r.numero)
    from reglas_agente r
   where r.activo is distinct from false;
$fn$;

-- El prompt terminado, o null si no se puede armar uno bueno.
create or replace function prompt_vigente()
returns text
language plpgsql
stable
set search_path = public
as $fn$
declare
  t text;
  reglas text;
  c record;
begin
  select p.texto into t from prompt_base p limit 1;
  if t is null or btrim(t) = '' then
    return null; -- todavía no se cargó la plantilla: manda el prompt.md de la función
  end if;

  -- limpiarPlantilla(): finales de línea, comentarios HTML, sin líneas en blanco al principio,
  -- nunca más de una en el medio, una sola al final.
  t := replace(replace(t, E'\r\n', E'\n'), E'\r', E'\n');
  t := prompt_sin_comentarios(t);
  t := regexp_replace(t, '^\n+', '');
  t := regexp_replace(t, E'\n{3,}', E'\n\n', 'g');

  if position('{{REGLAS_NUMERADAS}}' in t) > 0 then
    reglas := prompt_reglas_numeradas();
    if reglas is null or reglas = '' then
      return null; -- reglas_agente vacía: el prompt quedaría sin sus reglas
    end if;
    t := replace(t, '{{REGLAS_NUMERADAS}}', reglas);
  end if;

  for c in select clave, valor from contexto_agente loop
    t := replace(t, '{{CONTEXTO:' || c.clave || '}}', prompt_normalizar_contexto(c.valor));
  end loop;

  t := regexp_replace(t, '\s+$', '') || E'\n';

  -- Las dos validaciones que no se pueden saltear: ningún marcador sin resolver y la primera línea
  -- la que tiene que ser. El resto (techo de líneas, encabezado de reglas) las hace el panel al
  -- guardar, que es donde la dueña puede leer el error y corregirlo.
  if t like '%{{%' or t like '%}}%' or t like '%[[%' or t like '%]]%' then
    return null;
  end if;
  if split_part(t, E'\n', 1) !~ '^Sos Lucía,' then
    return null;
  end if;
  return t;
end;
$fn$;

revoke all on function prompt_vigente() from public, anon;
grant execute on function prompt_vigente() to authenticated, service_role;
grant execute on function prompt_reglas_numeradas() to authenticated, service_role;
grant execute on function prompt_normalizar_contexto(text) to authenticated, service_role;
grant execute on function prompt_sin_comentarios(text) to authenticated, service_role;

comment on function prompt_vigente() is
  'El prompt de Lucía terminado, con las reglas y el contexto de ahora. Null si no se puede armar uno bueno: el que llama usa el prompt.md que viene en la función.';
