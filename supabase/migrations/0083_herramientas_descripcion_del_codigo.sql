-- Las descripciones de herramientas guardadas en Configuración eran copias del código: la mayoría
-- del seed H1.4 (14/9) y el resto iguales al código. Las del seed quedaron viejas y TAPAN las del
-- código (index.ts: si hay descripción en la base, el modelo lee esa). Revisión del 4/10:
--   · derivar_a_persona decía "con reclamo o descuento, null", contra la regla del 19/9 (siempre
--     una despedida: el sistema la reemplaza);
--   · enviar_link no mencionaba web-venta;
--   · consultar_catalogo no tenía el filtro de modelo puntual (16/9) ni enviar_fotos el color.
-- Vacías, el modelo lee la del código. Si la dueña edita una desde el panel, vuelve a mandar esa.
update herramientas_agente set descripcion = '', editado_por = 'Mateo 4/10: usar la descripción del código', editado_at = now()
 where coalesce(trim(descripcion), '') <> '';
