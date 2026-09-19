-- 0016_negocio_catalogo_y_accesorios.sql — hito 1.9 (paneles).
--
-- El catálogo de 0003 guardaba un color y un talle por fila (`color text`, `talle text`),
-- pero lo que el dueño edita —la pantalla Catálogo de front y lo que devuelve
-- consultar_catalogo (AGENTE.md § 4)— es UN modelo con varios colores, un rango de talles,
-- sus fotos y una descripción corta que lee Lucía. Con una fila por color o por talle, el
-- mismo ambo aparecería repetido y su precio se editaría varias veces.
--   · colores: jsonb, lista de {nombre, hex}. El nombre lo usa Lucía («azul noche»); el
--     hex lo dibuja el panel.
--   · talles: text[] (hay talles numéricos, del 4 al 68, y de letra, XS…). consultar_catalogo
--     filtra con `talles @> array['48']`.
--   · descripcion: el texto corto que lee Lucía.
-- Lo que hubiera en las columnas viejas pasa a las nuevas y después se borran (al 13/9 la
-- tabla estaba vacía y ningún código las usaba).
--
-- accesorios_alquiler suma precio_compra: la opción de compra con descuento que
-- consultar_accesorios devuelve (AGENTE.md § 4). Queda null hasta que el dueño la cargue:
-- la ficha dice que existe, pero no da los montos.
-- Idempotente.

alter table catalogo_alquiler
  add column if not exists descripcion text,
  add column if not exists colores jsonb not null default '[]'::jsonb,
  add column if not exists talles text[] not null default '{}';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'catalogo_alquiler' and column_name = 'color') then
    execute $m$
      update catalogo_alquiler
         set colores = jsonb_build_array(jsonb_build_object('nombre', color, 'hex', null))
       where color is not null and colores = '[]'::jsonb
    $m$;
    alter table catalogo_alquiler drop column color;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'catalogo_alquiler' and column_name = 'talle') then
    execute $m$
      update catalogo_alquiler set talles = array[talle] where talle is not null and talles = '{}'
    $m$;
    alter table catalogo_alquiler drop column talle;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'catalogo_alquiler_colores_check') then
    alter table catalogo_alquiler add constraint catalogo_alquiler_colores_check
      check (jsonb_typeof(colores) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogo_alquiler_precio_check') then
    alter table catalogo_alquiler add constraint catalogo_alquiler_precio_check
      check (precio_base >= 0);
  end if;
end $$;

alter table accesorios_alquiler
  add column if not exists precio_compra numeric(12, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accesorios_alquiler_precios_check') then
    alter table accesorios_alquiler add constraint accesorios_alquiler_precios_check
      check (precio >= 0 and (precio_compra is null or precio_compra >= 0));
  end if;
end $$;
