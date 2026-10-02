-- Corrección explícita del dueño: talles infantiles 4 a 16.
UPDATE fragmentos SET texto = 'Tenemos trajes de alquiler para adultos, en talles del XS al 4XL, y también talles infantiles. Los talles de adultos van por letra. El talle justo se confirma en el local con la prueba y los ajustes de sastrería. Para niños consultá la ficha Talles infantiles. Si necesitás otra medida, un modelo o un caso especial sin confirmación, el equipo del local lo verifica; Lucía deriva sin negar disponibilidad.',
 editado_por = 'Mateo: corrección de talles infantiles' WHERE id = 'a9f10000-0000-4000-8000-000000000501';

INSERT INTO fragmentos (id, tema, titulo, texto, activo, editado_por) VALUES
('a9f10000-0000-4000-8000-000000000502', 'talles', 'Talles infantiles: niños, nenes y chicos',
 'Sí tenemos talles de niños del 4 al 16. Para un nene, niño o chico se puede consultar por ese rango infantil. No confundir el talle con la edad: el calce se confirma al probar. Este rango no confirma modelos, colores, precios ni stock para una fecha. Si se consulta un modelo o talle fuera de lo confirmado, derivar al equipo sin decir que no hay.', true, 'Mateo: talles infantiles 4 al 16'),
('a9f10000-0000-4000-8000-000000000102', 'que-incluye', 'Valor del alquiler a medida',
 'Mr Otto ofrece alquiler a medida, prendas de calidad, diseños nuevos y una solución completa. El traje se ajusta y, si hace falta, se confecciona para que quede bien el día del evento. La sastrería y la tintorería están incluidas. Explicá este valor cuando ayude a responder, sin repetirlo ni usarlo para demorar una reserva.', true, 'Organización del conocimiento'),
('a9f10000-0000-4000-8000-000000001203', 'que-no-hacemos', 'Pedidos corporativos y uniformes: datos para el equipo',
 'Los pedidos corporativos y uniformes los sigue el equipo especializado. El sistema avisa al equipo; si corresponde seguir recabando información, guardar cantidad de personas, rubro, prendas que usan actualmente, si llevan logo y proveedor actual. Una pregunta por vez, usando los datos ya dados. Los precios, plazos y condiciones los confirma el equipo; Lucía no los promete.', true, 'Organización del conocimiento')
ON CONFLICT (id) DO UPDATE SET tema = excluded.tema, titulo = excluded.titulo,
 texto = excluded.texto, activo = true, editado_por = excluded.editado_por;

UPDATE reglas_agente SET texto = 'Antes de afirmar que falta un producto, talle, servicio o disponibilidad, derivás directamente al equipo sin enviar una negativa. Una búsqueda vacía no demuestra que no exista. No inventás disponibilidad ni ofrecés una alternativa para encubrir una negativa.',
 editado_por = 'Mateo: derivar antes de negar' WHERE numero = 7;
UPDATE reglas_agente SET texto = 'Consultás la fuente del tema cuando la necesitás. Si falta información del negocio o hay contradicciones, derivás al equipo sin inventar ni afirmar que no hay.',
 editado_por = 'Mateo: consulta por tema' WHERE numero = 2;

-- Corrige también las instrucciones contradictorias del prompt actualmente guardado.
-- No activa los cambios de reserva anteriores: esta corrección es independiente.
UPDATE prompt_base SET texto = replace(replace(replace(texto,
'Si no está en la lista de lo que hacemos, no lo hacemos: se dice que no con naturalidad y se ofrece lo que sí hay. No prometas averiguar.',
'Si no aparece o no hay confirmación, derivá al equipo sin negar que exista o se ofrezca.'),
'Si no aparece ahí, no lo tenemos: ofrecé que lo vean en el local, nunca asumas por la foto.',
'Si no aparece ahí, derivá al equipo sin afirmar que no lo tenemos; la foto no confirma stock.'),
'Se dice que no'||chr(10)||'  con naturalidad y se ofrece lo que sí hay. Nunca «lo consulto».',
'Derivá al equipo antes de negar que exista o se ofrezca.'), editado_at = now()
WHERE unica = true;
