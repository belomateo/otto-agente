-- Catálogo de alquiler — los modelos publicados en mrotto.com.ar/alquiler, leídos el 17/9/2026.
--
-- Entran DESACTIVADOS (activo = false) y con precio_base = 0 a propósito. La web no publica el
-- precio del alquiler: muestra "$0" en las seis fichas y también en sus datos internos, así que
-- acá no hay ningún precio que copiar. Los carga la dueña (Sofía o Claudio, ficha del negocio).
-- Mientras estén desactivados, consultar_catalogo no los ve —filtra por `activo`— y Lucía sigue
-- derivando toda consulta de trajes, que es lo que hace hoy con el catálogo vacío.
--
-- OJO al activarlos: no hay nada que impida activar un modelo con precio 0. consultar_catalogo
-- devuelve precio_base tal cual y el prompt obliga a decir el precio junto con el modelo, así que
-- un modelo activo en 0 hace que Lucía le cotice "$0" a un cliente. Poner el precio ANTES de
-- activar.
--
-- Lo que sí salió de la web y es confiable: los nombres y las fotos. Lo demás, no:
--  · fotos: la web las sirve en .webp y WhatsApp no manda webp como imagen (solo JPEG y PNG).
--    El mismo CDN las devuelve en .jpg cambiando la extensión, y así quedan guardadas acá:
--    verificadas una por una, 200 image/jpeg, ~140 KB cada una.
--  · talles: las seis fichas dicen "42-66" (número de saco) y docs/ficha-del-negocio.md decía
--    "XS al 68". Mateo lo aclaró el 21/9 (vía logica): el piso es XS confirmado, no hay talles
--    de nene (los "desde el 4" que decía la ficha vieja están mal, se sacan) y el techo 4XL es
--    SUPUESTO — lo dijo en una tanda anterior pero no lo reconfirmó en esta. Nada de números de
--    saco (el 68): esa escala nunca se confirmó y un talle inexistente manda gente al local al
--    pedo. La escala completa (XS–4XL) se carga abajo con un UPDATE aparte, solo donde el talle
--    siga vacío (no pisa nada que la dueña ya haya cargado a mano).
--  · colores: van sin hex (la dueña elige el color real). El Smoking figura en la web como
--    "Pizarra" y la foto es negra: hay que confirmarlo con el local.
--  · descripción: la de la web es el mismo texto de marketing en todos los productos
--    ("Urban Concept. Elegi tu prenda favorita..."), no describe el modelo. Queda en null.
--
-- "Ambo Smoking" son dos productos distintos en la web (0203812 y 0202112) con el MISMO nombre.
-- Van como un modelo con dos colores, como el Ambo Tech, porque Lucía busca por nombre y dos
-- filas idénticas serían indistinguibles para ella y para el cliente. Si en el local son dos
-- prendas distintas, se separan desde el panel.
--
-- Idempotente y cuidadoso: al volver a correrlo actualiza SOLO lo que salió de la web (nombre,
-- fotos, colores). NO pisa precio_base, activo, talles ni descripcion, que son de la dueña: si
-- ella ya cargó los precios, correr esto de nuevo no se los borra.
insert into catalogo_alquiler (id, modelo, precio_base, fotos, colores, talles, descripcion, activo, orden, editado_por) values
  ('b7c10000-0000-4000-8000-000000000001', 'Ambo Livorno', 0,
   array['https://acdn-us.mitiendanube.com/stores/001/160/334/products/0204112-0-250_44_b-7ced3bb381dcd23e2217896576608711-480-0.jpg'],
   '[{"nombre": "Arena", "hex": null}]'::jsonb, '{}'::text[], null, false, 1, 'web mrotto.com.ar 17/9'),

  ('b7c10000-0000-4000-8000-000000000002', 'Ambo Smoking', 0,
   array['https://acdn-us.mitiendanube.com/stores/001/160/334/products/0203812-0-250_negro_b-3133d2a2e5be7c6f5417896533464443-480-0.jpg',
         'https://acdn-us.mitiendanube.com/stores/001/160/334/products/0202112-0-250_azul_b-ef3991ca20ff44445817896519218661-480-0.jpg'],
   '[{"nombre": "Pizarra", "hex": null}, {"nombre": "Azul Claro", "hex": null}]'::jsonb, '{}'::text[], null, false, 2, 'web mrotto.com.ar 17/9'),

  ('b7c10000-0000-4000-8000-000000000003', 'Ambo Tech', 0,
   array['https://acdn-us.mitiendanube.com/stores/001/160/334/products/0203115-0-260_azul-oscuro_b-37713cef6dde7aca7717896519659008-480-0.jpg',
         'https://acdn-us.mitiendanube.com/stores/001/160/334/products/0203115-0-260_gris-medio_b-dbc1e97776d470fe9717896530774210-480-0.jpg'],
   '[{"nombre": "Azul Oscuro", "hex": null}, {"nombre": "Gris Medio", "hex": null}]'::jsonb, '{}'::text[], null, false, 3, 'web mrotto.com.ar 17/9'),

  ('b7c10000-0000-4000-8000-000000000004', 'Ambo Liso', 0,
   array['https://acdn-us.mitiendanube.com/stores/001/160/334/products/0201112-0-250_b-8c528b4e0ada4db7a217896495508247-480-0.jpg'],
   '[{"nombre": "Azulino", "hex": null}]'::jsonb, '{}'::text[], null, false, 4, 'web mrotto.com.ar 17/9'),

  ('b7c10000-0000-4000-8000-000000000005', 'Otto Ambo Liso', 0,
   array['https://acdn-us.mitiendanube.com/stores/001/160/334/products/0204039-0-250_02_b-0456a31fb48fbd110c17896567138439-480-0.jpg'],
   '[{"nombre": "Gris Claro", "hex": null}]'::jsonb, '{}'::text[], null, false, 5, 'web mrotto.com.ar 17/9')
on conflict (id) do update
  set modelo = excluded.modelo,
      fotos = excluded.fotos,
      colores = excluded.colores
  where catalogo_alquiler.modelo is distinct from excluded.modelo
     or catalogo_alquiler.fotos is distinct from excluded.fotos
     or catalogo_alquiler.colores is distinct from excluded.colores;

-- XS confirmado, 4XL supuesto (ver comentario de arriba). Solo donde talles sigue vacío: si la
-- dueña ya cargó algo desde el panel, esto no lo toca.
update catalogo_alquiler
   set talles = array['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']
 where talles = '{}';
