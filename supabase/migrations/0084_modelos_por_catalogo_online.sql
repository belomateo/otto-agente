-- Pedido de Mateo (5/10), tres cosas:
--
-- 1. Lucía no asesora más sobre modelos: manda el catálogo online (enviar_link, tipo web) y aclara
--    que la disponibilidad depende del talle y de la fecha del alquiler. Si le mostraba al cliente
--    qué hay y en el local no estaba para su talle o su fecha, el problema lo tenía el equipo.
--    Se apaga enviar_fotos (se puede volver a prender desde Configuración › Herramientas), los
--    guiones de novio, graduado e invitado dejan de "mostrar dos looks", y se suma qué es el
--    catálogo online a como-funciona.
-- 2. Evento hoy o mañana: en vez de "te paso con un asesor", el teléfono del local para que lo
--    resuelva directo. Es el único caso en que Lucía pasa otro contacto. El texto anterior además
--    nunca salía: empezaba con "Te paso con", anuncia_sin_derivar lo tomaba como un pase sin
--    ejecutar y lo cambiaba por el genérico.
-- 3. El local abre de corrido (lunes a viernes de 10 a 19, sábados de 9:30 a 18:30): Lucía
--    recitaba las franjas internas de turnos ("de 10 a 14 y de 14 a 19") como si cortara.

update herramientas_agente set activa = false,
  editado_por = 'Mateo 5/10: Lucía no asesora modelos, manda el catálogo online', editado_at = now()
 where nombre = 'enviar_fotos';

update contexto_agente set valor = 'Para un evento tan cercano, lo mejor es que te comuniques directo con el local al +54 9 341 239 2502: ya les avisé, así te ayudan a resolverlo enseguida.',
  editado_por = 'Mateo 5/10: evento hoy o mañana, teléfono del local', editado_at = now()
 where clave = 'texto_evento_inminente';

update reglas_agente set texto = 'Nunca afirmás que falta ni prometés que hay un modelo, color, talle o disponibilidad: depende del talle y de la fecha del alquiler, y se confirma en el local. Para modelos, colores y estilos mandás el catálogo online. Si falta otro dato de Otto, derivás sin enviar una negativa: una búsqueda vacía no demuestra que no exista.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = '0a609b2d-f5b7-4625-9ef3-ae83cf7cf05a';

-- Base de conocimiento.
update fragmentos set texto = 'Los modelos y colores de alquiler, con sus fotos, se pueden ver en el catálogo online de la web de Mr Otto. La disponibilidad de cada modelo depende del talle y de la fecha del alquiler, por eso se confirma en el local: en el turno el equipo te muestra lo que hay para tu fecha, te lo probás y elegís con su asesoramiento.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000204';
insert into fragmentos (id, tema, titulo, texto, editado_por)
select 'a9f10000-0000-4000-8000-000000000204', 'como-funciona', 'Modelos y catálogo online',
  'Los modelos y colores de alquiler, con sus fotos, se pueden ver en el catálogo online de la web de Mr Otto. La disponibilidad de cada modelo depende del talle y de la fecha del alquiler, por eso se confirma en el local: en el turno el equipo te muestra lo que hay para tu fecha, te lo probás y elegís con su asesoramiento.',
  'Mateo 5/10: modelos por catálogo online'
 where not exists (select 1 from fragmentos where id = 'a9f10000-0000-4000-8000-000000000204');

update fragmentos set texto = 'Tenemos trajes de alquiler para adultos, en talles del XS al 4XL, y también talles infantiles. Los talles de adultos van por letra. El talle justo se confirma en el local con la prueba y los ajustes de sastrería. Para niños consultá la ficha Talles infantiles. La disponibilidad de cada modelo depende del talle y de la fecha del alquiler: se confirma en el local, sin prometerla ni negarla por acá.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000501';

update fragmentos set texto = 'Sí tenemos talles de niños del 4 al 16. Para un nene, niño o chico se puede consultar por ese rango infantil. No confundir el talle con la edad: el calce se confirma al probar. Este rango no confirma modelos, colores, precios ni stock para una fecha: la disponibilidad depende del talle y de la fecha del alquiler, y se confirma en el local.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000502';

update fragmentos set texto = '¡Felicitaciones! Si te casás, buscamos un look especial para vos: el novio tiene que estar impecable, como todos los que se casan con nosotros. Para ayudarte conviene saber la fecha del casamiento, si es de día o de noche y si es en salón, campo o iglesia. Los modelos los podés ir viendo en el catálogo online; la disponibilidad depende de tu talle y de la fecha, así que en el turno el equipo te muestra lo que hay para vos y te ayuda a elegir, con tiempo para que la sastrería lo deje perfecto para el gran día.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000001401';

update fragmentos set texto = 'Para graduaciones y fiestas de egresados del secundario, los modelos se pueden ver en el catálogo online, y en el local el equipo ayuda a elegir el look que mejor va con cada chico, según lo que haya para su talle y su fecha. Muchas veces escribe la mamá o el papá, cuando su hijo termina el colegio: se le habla a quien escribe y se le pregunta la fecha, si es de día o de noche y el talle aproximado. Si vienen de otra ciudad, coordinamos el turno pensando en la fecha para que resuelvan todo sin viajes de más.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000001501';

update fragmentos set texto = 'Si te invitaron al casamiento de un amigo, a una boda civil, a un cumple de 15 o a una fiesta, conviene saber la fecha y si es de día o de noche. Los modelos los podés ver en el catálogo online; la disponibilidad depende de tu talle y de la fecha, así que en el turno el equipo te muestra lo que hay para vos, y con los accesorios del local resolvés el look completo.',
  editado_por = 'Mateo 5/10: modelos por catálogo online', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000001601';

update fragmentos set texto = '¿Con cuánto tiempo conviene reservar? Lo ideal es entre 60 y 7 días antes del evento, así hay tiempo para elegir y para que la sastrería ajuste todo sin apuro. Si es urgente y el evento es en pocos días, igual llegás: siempre buscamos la forma. Si el evento es hoy o mañana, se resuelve directo con el local: te pasamos su teléfono para que lo coordines con ellos.',
  editado_por = 'Mateo 5/10: evento hoy o mañana, teléfono del local', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000701';

update fragmentos set texto = 'El local de alquiler queda en calle España 764, Rosario, y por ahora es el único: ahí se hace todo, la prueba, los ajustes, el retiro y la devolución. Lo mejor es venir con turno, así el equipo te dedica el tiempo que hace falta. El local abre de corrido, sin cortar al mediodía: el horario de atención sale de la agenda, y los turnos se dan dentro de ese horario. Si te piden un teléfono, la consulta se sigue por este mismo WhatsApp; solo si el evento es hoy o mañana se pasa el teléfono del local, para resolverlo directo.',
  editado_por = 'Mateo 5/10: el local abre de corrido', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000401';
