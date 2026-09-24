-- Fragmentos de conocimiento de Lucía (H1.6). Al menos uno por cada uno de los 16 temas de
-- AGENTE.md § 8, con texto sacado de docs/ficha-del-negocio.md y docs/otto-bot-notas.md.
-- Lucía los consulta con buscar_informacion; nunca están en el prompt (principio 2).
--
-- Lo que NO va acá, a propósito:
--  · precios: salen del catálogo y de accesorios (consultar_catalogo, consultar_accesorios);
--  · horarios del local y de los turnos: buscar_informacion los agrega leídos de horarios y
--    franjas_turnos (decisión #7), así no se desactualizan cuando el dueño los cambia; los
--    horarios concretos de un turno salen de buscar_horarios.
-- Lo que en las reglas provisorias de Fase 0 era dato (anticipación de 60 a 7 días, un
-- acompañante por persona, 10 minutos de tolerancia) quedó en anticipacion y como-funciona.
-- El fragmento "El turno en el local" es también el que arma la confirmación de un turno.
-- Los tres de objeciones son un borrador desde el ancla de valor: los corrige el dueño o
-- Mateo en Conocimiento.
--
-- 17/9/2026: seis fragmentos salen de las respuestas de Sofía (medios de pago del alquiler,
-- cancelación, prueba final, retiro anticipado, cambio de modelo, y que se puede entrar sin
-- turno). Están volcadas en docs/ficha-del-negocio.md § Alquiler. La cancelación va acá como
-- política: el monto exacto lo cierra el local, porque depende de fechas del contrato que
-- Lucía no tiene.
--
-- Idempotente: cada fragmento tiene su id fijo; correrlo de nuevo solo pisa lo que cambió
-- (y el trigger deja historial). Ojo: volver a correrlo después de que el dueño editó un
-- fragmento lo devuelve a esta versión.
insert into fragmentos (id, tema, titulo, texto, editado_por) values
  ('a9f10000-0000-4000-8000-000000000101', 'que-incluye', 'Qué incluye el precio',
   'El precio del alquiler incluye el ambo —o sea el traje: saco y pantalón— y el servicio de sastrería y tintorería antes y después del evento: lo recibís limpio, planchado y listo para usar. La camisa, la corbata y los zapatos no vienen incluidos: se alquilan aparte, para completar el look.',
   'confirmado por la dueña, 22/9: "el ambo solo, camisa corbata y zapatos aparte" — reemplaza el seed de H1.6. Ampliado por logica, 23/9 (barrido de 486 agentes, vocabulario de búsqueda): "ambo —o sea el traje—" para que enganche con quien busca "traje" o "ambo" indistinto. "Planchado" confirmado por la dueña, 23/9 (dato nuevo, antes solo decía "listo para usar" en general). Aplicado en la base, sincronizado acá'),

  ('a9f10000-0000-4000-8000-000000000201', 'como-funciona', 'Cómo es el alquiler, paso a paso',
   'Primero venís al local con turno: el asesor te muestra modelos, te probás el que más te guste y te toma las medidas. Si lo alquilás, la sastrería lo ajusta a tu medida. El traje se retira (lo pasás a buscar) un día antes del evento, con una prueba final para ver que esté perfecto, y se devuelve un día hábil después: lo devolvés acá mismo. En total te quedás con el traje 3 días. Si viajás o no podés retirarlo ese día, se coordina el retiro uno o dos días antes. La tintorería corre por nuestra cuenta.',
   'respuestas de Sofía 17/9; "3 días" confirmado por la dueña, 22/9'),

  ('a9f10000-0000-4000-8000-000000000202', 'como-funciona', 'El turno en el local',
   'Te esperamos en España 764, Rosario. Se permite un acompañante por persona y hay 10 minutos de tolerancia. Si alquilás, para reservar el traje se abona el 100% en el local. Si no podés venir, avisanos y lo reprogramamos.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000000203', 'como-funciona', 'Cambiar el modelo elegido',
   'Si ya elegiste tu traje y después querés cambiarlo por otro modelo, se puede: depende de que el que quieras esté disponible para tu fecha. Avisanos apenas lo sepas, así el equipo lo chequea y te lo cambia.',
   'respuestas de Sofía 17/9'),

  ('a9f10000-0000-4000-8000-000000000301', 'reserva-y-garantia', 'Pago y garantía',
   'No se deja seña: para reservar el traje se abona el 100% del alquiler, todo junto, en el local, en el mismo turno en que lo elegís. Se puede pagar en efectivo, por transferencia —también por Mercado Pago, que es una transferencia—, con tarjeta de débito o con tarjeta de crédito en un pago; también en tres cuotas con tarjeta de crédito —son las cuotas del banco—, con un 10% de recargo. El día de la prueba final se deja una tarjeta de crédito como garantía, también en el local. Por WhatsApp no se cobra ni se piden datos de tarjeta.',
   'respuestas de Sofía 17/9. "son cuotas del banco" confirmado por la dueña, 23/9 (el 10% de recargo no cambió). Corregido por Mateo, 24/9: Mercado Pago no es un medio aparte, es POR TRANSFERENCIA — la primera versión (23/9) lo había listado como una opción más, separada de transferencia; aplicado en la base por logica, sincronizado acá, sin regresión de búsqueda'),

  ('a9f10000-0000-4000-8000-000000000302', 'reserva-y-garantia', 'Si cancelás el alquiler',
   'El contrato de alquiler tiene una penalidad por cancelación, y cuánto es depende de cuándo cancelás: dentro de los 5 días hábiles de haber firmado el contrato, la penalidad es del 30% del total; pasado ese plazo y hasta 10 días antes de la fecha de uso, es del 70%; y desde los 9 días antes de la fecha de uso ya no hay devolución. Cuánto corresponde en cada caso lo cierra el equipo del local, porque depende de las fechas que figuran en el contrato.',
   'respuestas de Sofía 17/9'),

  ('a9f10000-0000-4000-8000-000000000401', 'ubicacion-horarios', 'Dónde estamos',
   'El local de alquiler queda en calle España 764, Rosario, y por ahora es el único: ahí se hace todo, la prueba, los ajustes, el retiro y la devolución. Lo mejor es venir con turno, así el equipo te dedica el tiempo que hace falta. El local abre más horas que las de los turnos de alquiler: los horarios de atención y de turnos salen de la agenda. Si te piden un teléfono, la consulta se sigue por este mismo WhatsApp: no pasamos otro contacto por acá.',
   'respuestas de Sofía 17/9. Corregido por Mateo, 23/9: la versión anterior decía "también atienden por teléfono" (confirmado por la dueña, 22/9) — Mateo aclaró que el único número publicado en la web (341 638-1733) NO es este WhatsApp, así que mandar gente ahí perdía la consulta; eligió que todo se siga por acá. También confirmado: por ahora hay un solo local. Ojo con "número": no decir la palabra en esta ficha, le robaba el término a "hasta qué número tienen" de talles (hallazgo de logica, 23/9, medido antes de aplicar)'),

  ('a9f10000-0000-4000-8000-000000000402', 'ubicacion-horarios', 'Venir sin turno',
   'Podés pasar por el local sin turno, solo a mirar los modelos. Si en ese momento hay lugar, también te podés medir y dejar tu alquiler hecho. Con turno igual es mejor: el asesor te dedica todo el tiempo que haga falta.',
   'respuestas de Sofía 17/9'),

  ('a9f10000-0000-4000-8000-000000000501', 'talles', 'Talles',
   'Tenemos trajes de alquiler de hombre adulto, en talles del XS al 4XL. Los talles van por letra, no por número de saco. El 4XL es el talle más grande que manejamos y el XS el más pequeño. No trabajamos talles de niño: para un nene no tenemos nada. Tampoco alquilamos para mujeres: es ropa de hombre. El talle justo se ve en el local, probándolo, y la sastrería lo ajusta. Si sos grandote y el 4XL no te entra, o tu talle queda fuera de ese rango, dejá que el equipo del local te confirme cómo seguir.',
   'Mateo, 21/9: el piso confirmado es XS y no existen los talles de nene (antes decía "desde el talle 4", mal); el techo 4XL en ese momento era interpretación de logica, marcado como supuesto. Ampliado por logica, 23/9 (barrido de 486 agentes, vocabulario de búsqueda): sumadas las palabras con las que pregunta un cliente real ("hasta qué número", "grandote"). Confirmado por Mateo, 23/9 (dejó de ser supuesto): los talles van por LETRA, no por número de saco (así que no repetir el 68 que tenía el seed original), el techo 4XL queda CONFIRMADO explícito, y no alquilan para mujeres. Aplicado en la base, sincronizado acá'),

  ('a9f10000-0000-4000-8000-000000000601', 'a-medida', 'Hecho a tu medida',
   'En Mr Otto el alquiler es a medida: en el turno te prueban el traje, te toman las medidas y la sastrería hace los arreglos que hagan falta (achicar, alargar, las mangas, el ruedo del pantalón) para que te quede perfecto el día del evento. Lo que no se puede es agrandar ni ensanchar un traje de alquiler: los arreglos van para achicar o alargar. Si hace falta, se confecciona. Las medidas se toman siempre en el local, y la sastrería y la tintorería ya están incluidas.',
   'seed H1.6. Confirmado por Mateo, 23/9: un traje de alquiler no se puede agrandar ni ensanchar, solo achicar o alargar — antes no estaba dicho y era una de las dudas del barrido de logica'),

  ('a9f10000-0000-4000-8000-000000000602', 'a-medida', 'Retoques en la prueba final',
   'Si en la prueba final el traje necesita un retoque, los sastres lo arreglan ahí mismo, en el momento. Según el arreglo puede demorar entre una y dos horas, así que tené previsto ese tiempo. No hace falta volver otro día.',
   'respuestas de Sofía 17/9'),

  ('a9f10000-0000-4000-8000-000000000701', 'anticipacion', 'Anticipación',
   '¿Con cuánto tiempo conviene reservar? Lo ideal es entre 60 y 7 días antes del evento, así hay tiempo para elegir y para que la sastrería ajuste todo sin apuro. Si es urgente y el evento es en pocos días, igual llegás: siempre buscamos la forma. Si el evento es hoy o mañana, te paso con un asesor del local, que hace lo posible por encontrarte un lugar en la agenda.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000000801', 'accesorios', 'Completar el look: camisa, corbata, cinto y zapatos',
   'Para completar el look alquilamos camisa, corbata, cinturón (cinto) y zapatos, según lo que necesites. Si preferís quedártelos, esas prendas se pueden comprar con descuento por alquilar con nosotros. En el turno el equipo te ayuda a combinar todo, así resolvés el look completo de una vez.',
   'seed H1.6. Título ampliado por logica, 23/9 (barrido de 486 agentes, vocabulario de búsqueda): el título original no nombraba las prendas, así que una consulta como "tienen corbata" no enganchaba con él (el título pesa en el ranking). Texto sin cambios. Aplicado en la base, sincronizado acá'),

  ('a9f10000-0000-4000-8000-000000000901', 'objecion-precio', 'Si le parece caro (borrador)',
   'Si te parece caro, es entendible: es plata y es una decisión importante. Lo que pagás no es solo el traje: es un alquiler a medida, con la sastrería que lo ajusta para que te quede perfecto y la tintorería antes y después, todo incluido. Son prendas de calidad y diseños nuevos, y te llevás una solución completa. En precio, calidad y servicio es de lo mejor del mercado, y lo que más nos importa es que ese día tu apariencia sea lo primero.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000001001', 'objecion-turno', 'Si lo quiere pensar (borrador)',
   'Si lo querés pensar y decidirlo después, no te preocupes: tomate tu tiempo para hablarlo con quien tengas que hablarlo. Cuando lo confirmes, me avisás y buscamos un horario para que te lo pruebes. Reservar con tiempo ayuda a que el ajuste quede perfecto, pero hoy no hace falta decidir nada.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000001101', 'objecion-competencia', 'Si está comparando (borrador)',
   'Está perfecto comparar antes de decidir, y si en otro lado te lo dejan más barato, vale mirar qué incluye. Lo que nos distingue es que el alquiler es a medida: el traje se ajusta en nuestra sastrería para que te quede perfecto, e incluye la tintorería antes y después. Son prendas de calidad y diseños nuevos, y resolvés el look completo con el mismo equipo. En precio, calidad y servicio es de lo mejor del mercado.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000001201', 'que-no-hacemos', 'Fuera del alquiler',
   'El alquiler es solo en el local de España 764, Rosario: no hacemos envíos ni te lo mandamos a tu casa, porque la prueba final y los ajustes se hacen acá. Si venís de otra ciudad, coordinamos el turno pensando en la fecha del evento. Los uniformes y los pedidos para empresas los atiende otro equipo de Mr Otto.',
   'seed H1.6, recortado 20/9 (la venta pasó a su propio fragmento: mezclada acá, la subía de largo y le hacía perder contra otros temas)'),

  ('a9f10000-0000-4000-8000-000000001202', 'que-no-hacemos', 'Comprar en vez de alquilar',
   'Mr Otto también vende trajes, no solo alquila: la compra se hace por la web de venta, no acá en el chat. Si pregunta por comprar, se le manda el link de venta en el mismo mensaje, sin esperar a que lo pida de nuevo. El alquiler es distinto y lo maneja Lucía directamente por acá: turnos, medidas y trajes a medida, así que si lo suyo es alquilar, sigue la charla normal.',
   'nuevo 20/9 (Mateo: Lucía derivaba de más por venta, sin ofrecer nada — antes esto vivía mezclado en "Fuera del alquiler" como "es de otra área", lo que empujaba a derivar en vez de contestar). Redactado más imperativo el 20/9 (logica probó en vivo: el link salía una de cada dos veces)'),

  ('a9f10000-0000-4000-8000-000000001301', 'descuentos', 'Descuentos',
   'Alquilando con nosotros, las prendas para completar el look se pueden comprar con descuento. Sobre el alquiler en sí, cualquier rebaja, promo o descuento especial lo decide una persona del equipo, no se define por este canal.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000001302', 'descuentos', 'Descuento por grupo',
   'Para casamientos, si son más de tres personas (cuatro o más) las que alquilan juntas, hay un 15% de descuento sobre el ambo. El descuento es solo sobre el ambo: los accesorios (camisa, corbata, cinturón, zapatos) quedan afuera. Es únicamente para casamientos, no aplica a graduaciones ni a otros eventos.',
   'confirmado por la dueña, 22/9, textual: "grupos de casamiento, mas de 3 personas 15% de descuento en el ambo (no incluye accesorios el descuento)". Título recortado por agente, 23/9: "(casamiento)" en el título le ganaba el primer puesto a novio/invitado en una consulta que solo dice "casorio"/"casamiento" sin más contexto (el peso 1.5 del título, mismo patrón que el hallazgo de logica del 20/9 con la venta) — el texto ya deja clarísimo que es para casamientos, no hacía falta repetirlo en el título'),

  ('a9f10000-0000-4000-8000-000000001401', 'novio', 'El que se casa (guion)',
   '¡Felicitaciones! Si te casás, buscamos un look especial para vos: el novio tiene que estar impecable, como todos los que se casan con nosotros. Para recomendarte bien conviene saber la fecha del casamiento, si es de día o de noche, si es en salón, campo o iglesia, y si ya tenés una idea de estilo o de colores. Con eso te mostramos dos looks y te proponemos un turno para probarlos con tiempo, así la sastrería lo deja perfecto para el gran día.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000001501', 'graduado', 'Graduaciones (guion)',
   'Para graduaciones y fiestas de egresados del secundario tenemos diferentes modelos y colores, para elegir el look que mejor va con cada chico. Muchas veces escribe la mamá o el papá, cuando su hijo termina el colegio: se le habla a quien escribe y se le pregunta la fecha, si es de día o de noche y el talle aproximado. Si vienen de otra ciudad, coordinamos el turno pensando en la fecha para que resuelvan todo sin viajes de más.',
   'seed H1.6'),

  ('a9f10000-0000-4000-8000-000000001601', 'invitado', 'Invitados (guion)',
   'Si te invitaron al casamiento de un amigo, a una boda civil, a un cumple de 15 o a una fiesta, conviene saber la fecha, si es de día o de noche y si tenés preferencia de color. Con eso te mostramos dos opciones y te proponemos un turno para probártelas; con los accesorios del local resolvés el look completo.',
   'seed H1.6')
on conflict (id) do update
  set tema = excluded.tema,
      titulo = excluded.titulo,
      texto = excluded.texto,
      activo = true,
      editado_por = excluded.editado_por
  where fragmentos.tema is distinct from excluded.tema
     or fragmentos.titulo is distinct from excluded.titulo
     or fragmentos.texto is distinct from excluded.texto
     or fragmentos.activo is distinct from true;
