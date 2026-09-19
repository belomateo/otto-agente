-- 0051_base_prompt_vigente_guardas.sql — arregla un agujero de 0050 que apareció en el control en
-- vivo del 16/9, antes de salir a producción.
--
-- Qué pasó. El arnés de pruebas del panel escribió en la tabla REAL: prompt_base quedó con
-- «Sos Lucía, asistente de Mr. Otto.\n1. Regla uno.» — 47 caracteres. Las dos guardas de 0050
-- (que arranque con «Sos Lucía,» y que no queden marcadores sin resolver) lo dejaron pasar, así
-- que el worker se lo dio al modelo como prompt bueno y no cayó al respaldo. Lucía, sin
-- instrucciones, contestó vacío: inventó precios y la barandilla precio_sin_herramienta la frenó
-- turno tras turno. El cliente no habría recibido NADA, sin un solo error visible.
--
-- La plantilla ya se restauró del historial. Esto es para que no vuelva a pasar: el problema de
-- fondo es que las guardas miraban la forma del texto y no si el prompt estaba entero.
--
-- Las dos guardas nuevas, las dos sin números mágicos:
--  · Tiene que estar el encabezado «REGLAS QUE NUNCA ROMPES», que es el que el generador exige y
--    el que separa el prompt de cualquier otra cosa que alguien escriba ahí.
--  · Las reglas que hay cargadas tienen que estar ADENTRO del prompt armado. Si la plantilla
--    perdió el marcador {{REGLAS_NUMERADAS}} —que es exactamente lo que pasó— las reglas nunca se
--    pegan, y un prompt de Lucía sin sus reglas no es el prompt de Lucía. Esto también cubre el
--    caso de que alguien pegue un texto cualquiera: sin las reglas de verdad adentro, no pasa.
--
-- Cuando no pasa, prompt_vigente() devuelve null y el worker usa el prompt.md que viaja adentro
-- de la función, que es el último que pasó TODAS las validaciones del generador. Es justo lo que
-- tenía que haber pasado hoy.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

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

  t := replace(replace(t, E'\r\n', E'\n'), E'\r', E'\n');
  t := prompt_sin_comentarios(t);
  t := regexp_replace(t, '^\n+', '');
  t := regexp_replace(t, E'\n{3,}', E'\n\n', 'g');

  reglas := prompt_reglas_numeradas();
  if reglas is null or reglas = '' then
    return null; -- reglas_agente vacía: el prompt quedaría sin sus reglas
  end if;
  if position('{{REGLAS_NUMERADAS}}' in t) > 0 then
    t := replace(t, '{{REGLAS_NUMERADAS}}', reglas);
  end if;

  for c in select clave, valor from contexto_agente loop
    t := replace(t, '{{CONTEXTO:' || c.clave || '}}', prompt_normalizar_contexto(c.valor));
  end loop;

  t := regexp_replace(t, '\s+$', '') || E'\n';

  -- Ningún marcador sin resolver.
  if t like '%{{%' or t like '%}}%' or t like '%[[%' or t like '%]]%' then
    return null;
  end if;
  -- La primera línea, la que tiene que ser.
  if split_part(t, E'\n', 1) !~ '^Sos Lucía,' then
    return null;
  end if;
  -- El encabezado que el generador exige.
  if position(E'\nREGLAS QUE NUNCA ROMPES\n' in E'\n' || t) = 0 then
    return null;
  end if;
  -- Y las reglas que hay cargadas, adentro: si la plantilla perdió el marcador, esto lo agarra.
  if position(reglas in t) = 0 then
    return null;
  end if;
  return t;
end;
$fn$;

revoke all on function prompt_vigente() from public, anon;
grant execute on function prompt_vigente() to authenticated, service_role;
