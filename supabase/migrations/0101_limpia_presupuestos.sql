-- 0101_limpia_presupuestos.sql — PROPUESTA del trabajo 5 (10/10), NO APLICADA: la aplica Mateo a
-- mano si le parece bien. Idempotente.
--
-- Qué limpia: fichas con presupuesto_mencionado = el precio que dijo Lucía. El cliente preguntaba
-- «¿cuánto sale?», Lucía contestaba «el alquiler arranca a partir de $150.000» y el fichero
-- (llm/extractor.ts) —y 13 veces la propia Lucía con guardar_datos_cliente— lo anotaba como si
-- fuera la plata que el cliente tiene para gastar. En la ficha del panel y en la libreta que lee
-- Lucía («lo que dijo del presupuesto: a partir de $150.000») quedaba un dato que el cliente nunca
-- dio. El arreglo de código (instrucción, esquema y guarda) es del mismo trabajo; esto limpia lo que
-- ya quedó escrito.
--
-- Medido el 10/10, solo lectura: 163 de las 295 fichas reales tenían presupuesto. 161 nombran un
-- precio de la casa (las 161 el del ambo; 9 además camisa y corbata, 8 zapato y cinturón) y en 160 el
-- cliente nunca escribió ese número: esas 160 son las que borra esto. No toca «90» ni «no tengo la
-- plata» (no son precios de la casa) ni la ficha donde el cliente preguntó «¿están todos en
-- 150mil?»: nombró el número, y la regla 3 la deja (es un eco igual; si se quiere, se borra a mano
-- desde el panel).
--
-- Criterio, el mismo de la guarda del fichero (esUnPrecioQueDijoLucia, llm/extractor.ts): se borra
-- el presupuesto solo si
--   1) nombra algún precio de la casa, en cualquiera de sus formas (150000, 150.000, 150 mil, 150k,
--      150): los de catalogo_alquiler y accesorios_alquiler, leídos de las tablas, más los del 10/10
--      por si el precio cambia antes de aplicar esto (las fichas viejas tienen el precio viejo);
--   2) sacándole esos precios no le queda ningún otro número (si quedó mezclado con algo que dijo
--      el cliente, «tengo 200 mil», no se toca); y
--   3) el cliente no escribió ninguno de esos precios en ningún mensaje suyo, de texto o de audio.
-- Lo borrado queda en historial_ediciones (trigger trg_historial de clientes, 0023): se puede volver
-- atrás fila por fila. Correrla dos veces no cambia nada más (lo borrado ya es null).

with precios as (
  select distinct p
    from (
      select precio_base::numeric as p from catalogo_alquiler
      union all select precio::numeric from accesorios_alquiler
      union all select precio_compra::numeric from accesorios_alquiler
      -- Los precios del 10/10 (ambo; camisa y corbata; zapato y cinturón), los que quedaron en las
      -- fichas. Van fijos a propósito: esto es una foto de lo que se dijo, no el precio vigente.
      union all select unnest(array[150000, 33500, 55000])::numeric
    ) t
   where p >= 1000
),
-- Cada precio como se puede escribir: «150000», «150.000» o «150 000»; «150 mil», «150 lucas» o
-- «150k», y si es redondo también «150» a secas (así lo escribe un cliente); «33,5 mil» si no lo es.
formas as (
  select p,
         floor(p / 1000)::bigint::text || '[.[:space:]]?' || lpad((p % 1000)::bigint::text, 3, '0') || '|' ||
         case when p % 1000 = 0
              then floor(p / 1000)::bigint::text || '([[:space:]]*(mil|lucas|luquitas|k))?'
              else floor(p / 1000)::bigint::text || '[.,]' || rtrim(lpad((p % 1000)::bigint::text, 3, '0'), '0') ||
                   '[[:space:]]*(mil|lucas|luquitas|k)'
         end as forma
    from precios
),
patron as (
  select '(^|[^0-9.,])(' || string_agg(forma, '|') || ')($|[^0-9])' as todos from formas
)
update clientes c
   set presupuesto_mencionado = null,
       editado_por = 'migracion-0101',
       actualizado_at = now()
  from patron
 where c.presupuesto_mencionado is not null
   -- 1) nombra un precio de la casa
   and c.presupuesto_mencionado ~* patron.todos
   -- 2) y no le queda ningún otro número
   and regexp_replace(c.presupuesto_mencionado, patron.todos, ' ', 'gi') !~ '[0-9]'
   -- 3) y el cliente nunca lo escribió
   and not exists (
     select 1
       from formas f
       join conversaciones co on co.cliente_id = c.id
       join mensajes m on m.conversacion_id = co.id and m.direccion = 'entrante'
      where c.presupuesto_mencionado ~* ('(^|[^0-9.,])(' || f.forma || ')($|[^0-9])')
        and (coalesce(m.contenido, '') || ' ' || coalesce(m.transcripcion, '')) ~* ('(^|[^0-9.,])(' || f.forma || ')($|[^0-9])')
   );
