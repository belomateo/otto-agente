# Lucía: información y funciones

Inventario del 1 de octubre de 2026, actualizado con pruebas reales del 2 de octubre. No incluye conversaciones ni datos personales de clientes reales.

## Estado de esta entrega

Los cambios están implementados y comprobados con la IA real y clientes ficticios. Todavía no están publicados en la versión que atiende WhatsApp ni en el panel del personal. Las secciones siguientes describen el comportamiento preparado y distinguen los datos que ya estaban cargados.

## Reservas

- Alcanza con teléfono, fecha y hora elegidas. El teléfono viene de la conversación.
- Lucía comprueba el horario y guarda el turno en el calendario del panel. No hace falta otro agente.
- Nombre y correo son opcionales. Si faltan, los solicita después de reservar.
- Envía una sola lista con Nombre, Número, Día y hora y Gmail. Los opcionales vacíos dicen «No especificado».
- Acepta correos de cualquier proveedor. «Gmail» es solamente la etiqueta que pediste.
- Si después recibe nombre o correo, actualiza la ficha vinculada a la misma reserva y muestra la lista actualizada. No cambia la fecha ni crea otro turno.
- Puede reprogramar, cancelar, consultar y confirmar asistencia.
- Una fecha ambigua se aclara; no se inventa. El horario elegido no se cambia sin el cliente.
- Si no puede confirmar disponibilidad, deriva al equipo sin negar que haya lugar.
- Cuando no se conoce el tipo de visita se usa la duración habitual, sin inventar el rol del cliente. Si se conoce que se prueban dos o tres personas, se contempla ese tiempo.

## Conversaciones y mensajes

- Los agradecimientos y cierres como «ok» o «muchas gracias por tu atención» no vuelven a disparar la explicación de venta.
- No debe repetir enlaces, preguntas ni información que ya dio. Puede reenviar un enlace si el cliente lo pide.
- Cada casilla muestra quién escribió el último mensaje: Cliente, Lucía o Equipo.
- Muestra día y hora del último mensaje y cantidad de mensajes sin leer.
- Las conversaciones se ordenan por su mensaje más reciente, venga del cliente o de nosotros.
- El filtro «Sin leer» permite ver las pendientes. «Sin respuesta» distingue las que terminan con un mensaje del cliente.
- La lectura es compartida por el personal: se marca al ver el final de la conversación, con la ventana visible. Una respuesta de Lucía no significa que el equipo haya leído.
- La bandeja consulta novedades cada cinco segundos. No es una notificación del teléfono ni una alarma sonora.
- La conversación abierta no cambia sola cuando otra sube al primer lugar.
- Los mensajes anteriores a la incorporación de esta función aparecen pendientes hasta abrirlos. El hilo carga hasta los últimos 500 mensajes; la bandeja muestra hasta 200 conversaciones.

## Dónde busca cada cosa

El mensaje principal quedó en 130 líneas. Conserva identidad, tono, reglas, cómo reservar y un índice de consultas.

Se sacaron del mensaje principal los detalles de direcciones, horarios, talles, condiciones comerciales, explicaciones del servicio y guiones de asesoramiento. Se consultan cuando hacen falta:

| Información | Lugar que consulta Lucía | Lugar para mantenerla |
|---|---|---|
| Condiciones y respuestas del negocio | Base de conocimiento, por tema | Conocimiento |
| Modelos, colores, talles y precios | Catálogo | Catálogo |
| Complementos y sus precios | Accesorios | Catálogo |
| Horarios, cierres, probadores y duración | Agenda y configuración | Calendario / Configuración de agenda |
| Datos del cliente y notas | Ficha del cliente | Clientes |
| Turnos existentes | Calendario propio | Calendario |
| Mapa, reseña y webs | Enlaces | Configuración de enlaces |

Usa la base de conocimiento que el proyecto ya tiene. No se agregó otro servicio ni se duplicó toda la información en el mensaje principal.

## Catálogo cargado

Estos son los valores leídos de la base en esta revisión; Lucía debe volver a consultarlos antes de cotizar.

| Modelo | Colores | Talles cargados | Alquiler | Fotos |
|---|---|---|---|---|
| Ambo Livorno | [object Object] | XS, S, M, L, XL, XXL, 3XL, 4XL | $ 150.000 | 1 |
| Ambo Smoking | [object Object], [object Object] | XS, S, M, L, XL, XXL, 3XL, 4XL | $ 150.000 | 2 |
| Ambo Tech | [object Object], [object Object] | XS, S, M, L, XL, XXL, 3XL, 4XL | $ 150.000 | 2 |
| Ambo Liso | [object Object] | XS, S, M, L, XL, XXL, 3XL, 4XL | $ 150.000 | 1 |
| Otto Ambo Liso | [object Object] | XS, S, M, L, XL, XXL, 3XL, 4XL | $ 150.000 | 1 |

| Accesorio | Alquiler | Compra |
|---|---|---|
| Zapato + cinturón | $ 55.000 | Sin precio cargado |
| Camisa + corbata | $ 33.500 | Sin precio cargado |

**Niños: talles 4 al 16, confirmados por vos.** No hay todavía modelos, fotos, precios ni disponibilidad específica infantil en el catálogo. Ese rango no debe presentarse como una garantía de stock para cualquier fecha o modelo. La edad tampoco equivale automáticamente al talle.

## Atención y agenda

- Alquiler y prueba: España 764, Rosario.
- Lunes a viernes: 10 a 19. Sábado: 9:30 a 18:30.
- **Domingos cerrado**, confirmado por vos. La fila del domingo ya estaba desactivada; sus horas guardadas no significan que esté abierto.
- WhatsApp puede recibir consultas fuera del horario de atención presencial.
- Franjas de turnos: lunes a viernes de 10 a 14 y de 14 a 19; sábado de 9:30 a 12 y de 13:15 a 18:30.
- Hay tres probadores en la configuración; Lucía tiene dos habilitados. La capacidad de cada franja y los bloqueos también se respetan.
- Los comienzos se organizan cada 15 minutos. La configuración permite simultáneos el sábado.
- Duraciones: invitado, novio y graduado 45 minutos; doble 90; triple 120; prueba final 15.
- Configuración de reserva para urgencias: siete días. Aviso al equipo por proximidad del turno: 30 minutos.
- La disponibilidad real se calcula al consultar: no se deduce solamente del horario general.
- El destino actual de las reservas es el calendario del panel. La conexión con Google Calendar está pausada en este proyecto.

## Qué recuerda de cada cliente

Teléfono, nombre, correo, evento, fecha del evento, rol de quien usa el traje, si es de día o noche, talle aproximado, ciudad, color preferido y presupuesto mencionado. También conserva notas, historial de conversación y turnos.

Solo debe guardar lo que el cliente contó. Los datos del evento y las preferencias ayudan a asesorar, pero no son obligatorios para reservar una visita.

## Acciones disponibles

Las 14 funciones están habilitadas en la configuración leída:

- **agendar_turno:** Guardar una visita en el calendario del panel.
- **anotar:** Guardar preferencias o detalles útiles en la libreta del cliente.
- **buscar_horarios:** Consultar huecos reales, incluida la fecha y hora exactas elegidas.
- **buscar_informacion:** Buscar por tema las respuestas y condiciones del negocio.
- **cancelar_turno:** Cancelar una visita del cliente.
- **confirmar_turno:** Registrar la confirmación de asistencia.
- **consultar_accesorios:** Consultar complementos, precios y condiciones cargadas.
- **consultar_catalogo:** Consultar modelos, colores, talles, precios y fotos cargadas.
- **derivar_a_persona:** Pasar la consulta al equipo y dejarla registrada para atención humana.
- **enviar_fotos:** Enviar hasta tres fotos disponibles del catálogo.
- **enviar_link:** Enviar mapa, reseña o web; evitar repetir el enlace salvo pedido expreso.
- **guardar_datos_cliente:** Completar la ficha; después de reservar, actualizar el resumen del mismo turno.
- **reprogramar_turno:** Mover una visita a otro horario disponible.
- **ver_turnos_cliente:** Consultar las visitas vigentes del cliente.

Puede trabajar con mensajes de texto, audios transcritos y fotos recibidas. Una imagen ayuda a entender la consulta, pero no confirma stock. Los adjuntos no soportados o audios incomprensibles requieren aclaración.

El personal puede intervenir, responder, tomar una charla y devolverla a Lucía. También dispone de fichas, notas, etiquetas y atención de derivaciones.

## Cuándo pasa la consulta al equipo

Antes de negar un producto, talle, servicio o disponibilidad; cuando falta un dato o hay contradicciones; ante reclamos, prendas dañadas o manchadas, pedidos expresos de hablar con una persona, descuentos fuera de las condiciones aprobadas y eventos urgentes. Los pedidos corporativos se notifican al equipo y pueden seguir completándose con los datos del pedido.

No debe inventar precios, sumar importes para crear un total no cargado, confirmar stock por una foto, pedir números de tarjeta, cobrar por WhatsApp ni enviar enlaces de pago.

## Automatizaciones existentes

El proyecto contiene recordatorios previos a la visita, confirmación de asistencia, agradecimiento con reseña, recontactos y avisos para el personal. Los envíos programados tienen controles para evitar duplicados y horarios inapropiados. Su código contempla recordatorios dentro de las 18 horas previas y recontactos a uno y tres días, sujetos a condiciones.

En esta revisión no se verificó que todas esas automatizaciones estén activas ni que sus plantillas estén habilitadas para enviar. No se hicieron envíos a clientes.

## Enlaces cargados

- Mapa: https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8
- Reseña Google: https://g.page/r/CYt3m6AmKYylEBM/review
- Turnero actual (doyturnos, se deja de usar para alquiler): https://app3.doyturnos.com/ottoalquiler
- Web Mr Otto — alquiler: https://www.mrotto.com.ar/alquiler/
- Web Mr Otto — venta: https://www.mrotto.com.ar/

El enlace antiguo de turnos sigue guardado, pero la reserva solicitada se hace dentro del calendario del panel.

## Información completa de la base de conocimiento

Las siguientes fichas incluyen la corrección infantil y las explicaciones trasladadas fuera del mensaje principal. Son material de consulta, no un texto que Lucía tenga que enviar completo. Los guiones de preguntas nunca deben frenar una reserva con teléfono, fecha y hora.

### Hecho a tu medida

Tema: a-medida.

En Mr Otto el alquiler es a medida: en el turno te prueban el traje, te toman las medidas y la sastrería hace los arreglos que hagan falta (achicar, alargar, las mangas, el ruedo del pantalón) para que te quede perfecto el día del evento. Lo que no se puede es agrandar ni ensanchar un traje de alquiler: los arreglos van para achicar o alargar. Si hace falta, se confecciona. Las medidas se toman siempre en el local, y la sastrería y la tintorería ya están incluidas.

### Retoques en la prueba final

Tema: a-medida.

Si en la prueba final el traje necesita un retoque, los sastres lo arreglan ahí mismo, en el momento. Según el arreglo puede demorar entre una y dos horas, así que tené previsto ese tiempo. No hace falta volver otro día.

### Completar el look: camisa, corbata, cinto y zapatos

Tema: accesorios.

Para completar el look alquilamos camisa, corbata, cinturón (cinto) y zapatos, según lo que necesites. Si preferís quedártelos, esas prendas se pueden comprar con descuento por alquilar con nosotros. En el turno el equipo te ayuda a combinar todo, así resolvés el look completo de una vez.

### Anticipación

Tema: anticipacion.

¿Con cuánto tiempo conviene reservar? Lo ideal es entre 60 y 7 días antes del evento, así hay tiempo para elegir y para que la sastrería ajuste todo sin apuro. Si es urgente y el evento es en pocos días, igual llegás: siempre buscamos la forma. Si el evento es hoy o mañana, te paso con un asesor del local, que hace lo posible por encontrarte un lugar en la agenda.

### Cambiar el modelo elegido

Tema: como-funciona.

Si ya elegiste tu traje y después querés cambiarlo por otro modelo, se puede: depende de que el que quieras esté disponible para tu fecha. Avisanos apenas lo sepas, así el equipo lo chequea y te lo cambia.

### Cómo es el alquiler, paso a paso

Tema: como-funciona.

Primero venís al local con turno: el asesor te muestra modelos, te probás el que más te guste y te toma las medidas. Si lo alquilás, la sastrería lo ajusta a tu medida. El traje se retira (lo pasás a buscar) un día antes del evento, con una prueba final para ver que esté perfecto, y se devuelve un día hábil después: lo devolvés acá mismo. En total te quedás con el traje 3 días. Si viajás o no podés retirarlo ese día, se coordina el retiro uno o dos días antes. La tintorería corre por nuestra cuenta.

### El turno en el local

Tema: como-funciona.

Te esperamos en España 764, Rosario. Se permite un acompañante por persona y hay 10 minutos de tolerancia. Si alquilás, para reservar el traje se abona el 100% en el local. Si no podés venir, avisanos y lo reprogramamos.

### Descuento por grupo (casamiento)

Tema: descuentos.

Para casamientos, si son más de tres personas (cuatro o más) las que alquilan juntas, hay un 15% de descuento sobre el ambo. El descuento es solo sobre el ambo: los accesorios (camisa, corbata, cinturón, zapatos) quedan afuera. Es únicamente para casamientos, no aplica a graduaciones ni a otros eventos.

### Descuentos

Tema: descuentos.

Alquilando con nosotros, las prendas para completar el look se pueden comprar con descuento. Sobre el alquiler en sí, cualquier rebaja, promo o descuento especial lo decide una persona del equipo, no se define por este canal.

### Graduaciones (guion)

Tema: graduado.

Para graduaciones y fiestas de egresados del secundario tenemos diferentes modelos y colores, para elegir el look que mejor va con cada chico. Muchas veces escribe la mamá o el papá, cuando su hijo termina el colegio: se le habla a quien escribe y se le pregunta la fecha, si es de día o de noche y el talle aproximado. Si vienen de otra ciudad, coordinamos el turno pensando en la fecha para que resuelvan todo sin viajes de más.

### Invitados (guion)

Tema: invitado.

Si te invitaron al casamiento de un amigo, a una boda civil, a un cumple de 15 o a una fiesta, conviene saber la fecha, si es de día o de noche y si tenés preferencia de color. Con eso te mostramos dos opciones y te proponemos un turno para probártelas; con los accesorios del local resolvés el look completo.

### El que se casa (guion)

Tema: novio.

¡Felicitaciones! Si te casás, buscamos un look especial para vos: el novio tiene que estar impecable, como todos los que se casan con nosotros. Para recomendarte bien conviene saber la fecha del casamiento, si es de día o de noche, si es en salón, campo o iglesia, y si ya tenés una idea de estilo o de colores. Con eso te mostramos dos looks y te proponemos un turno para probarlos con tiempo, así la sastrería lo deja perfecto para el gran día.

### Si está comparando (borrador)

Tema: objecion-competencia.

Está perfecto comparar antes de decidir, y si en otro lado te lo dejan más barato, vale mirar qué incluye. Lo que nos distingue es que el alquiler es a medida: el traje se ajusta en nuestra sastrería para que te quede perfecto, e incluye la tintorería antes y después. Son prendas de calidad y diseños nuevos, y resolvés el look completo con el mismo equipo. En precio, calidad y servicio es de lo mejor del mercado.

### Si le parece caro (borrador)

Tema: objecion-precio.

Si te parece caro, es entendible: es plata y es una decisión importante. Lo que pagás no es solo el traje: es un alquiler a medida, con la sastrería que lo ajusta para que te quede perfecto y la tintorería antes y después, todo incluido. Son prendas de calidad y diseños nuevos, y te llevás una solución completa. En precio, calidad y servicio es de lo mejor del mercado, y lo que más nos importa es que ese día tu apariencia sea lo primero.

### Si lo quiere pensar (borrador)

Tema: objecion-turno.

Si lo querés pensar y decidirlo después, no te preocupes: tomate tu tiempo para hablarlo con quien tengas que hablarlo. Cuando lo confirmes, me avisás y buscamos un horario para que te lo pruebes. Reservar con tiempo ayuda a que el ajuste quede perfecto, pero hoy no hace falta decidir nada.

### Qué incluye el precio

Tema: que-incluye.

El precio del alquiler incluye el ambo —o sea el traje: saco y pantalón— y el servicio de sastrería y tintorería antes y después del evento: lo recibís limpio, planchado y listo para usar. La camisa, la corbata y los zapatos no vienen incluidos: se alquilan aparte, para completar el look.

### Valor del alquiler a medida

Tema: que-incluye.

Mr Otto ofrece alquiler a medida, prendas de calidad, diseños nuevos y una solución completa. El traje se ajusta y, si hace falta, se confecciona para que quede bien el día del evento. La sastrería y la tintorería están incluidas. Explicá este valor cuando ayude a responder, sin repetirlo ni usarlo para demorar una reserva.

### Comprar en vez de alquilar

Tema: que-no-hacemos.

Mr Otto también vende trajes, no solo alquila. Los trajes para compra arrancan desde $540.000, y algunos modelos se pueden ver en la web www.mrotto.com.ar. La compra se hace en persona y sin turno, en cualquiera de los locales de Rosario: Córdoba 1369, Rioja 1615 o España 764. El alquiler es distinto y lo maneja Lucía directamente por acá: turnos, medidas y trajes a medida, así que si lo suyo es alquilar, sigue la charla normal.

### Fuera del alquiler

Tema: que-no-hacemos.

El alquiler es solo en el local de España 764, Rosario: no hacemos envíos ni te lo mandamos a tu casa, porque la prueba final y los ajustes se hacen acá. Si venís de otra ciudad, coordinamos el turno pensando en la fecha del evento. Los uniformes y los pedidos para empresas los atiende otro equipo de Mr Otto.

### Pedidos corporativos y uniformes: datos para el equipo

Tema: que-no-hacemos.

Los pedidos corporativos y uniformes los sigue el equipo especializado. El sistema avisa al equipo; si corresponde seguir recabando información, guardar cantidad de personas, rubro, prendas que usan actualmente, si llevan logo y proveedor actual. Una pregunta por vez, usando los datos ya dados. Los precios, plazos y condiciones los confirma el equipo; Lucía no los promete.

### Pago y garantía

Tema: reserva-y-garantia.

No se deja seña: para reservar el traje se abona el 100% del alquiler, todo junto, en el local, en el mismo turno en que lo elegís. Se puede pagar en efectivo, por transferencia —también por Mercado Pago, que es una transferencia—, con tarjeta de débito o con tarjeta de crédito en un pago; también en tres cuotas con tarjeta de crédito —son las cuotas del banco—, con un 10% de recargo. El día de la prueba final se deja una tarjeta de crédito como garantía, también en el local. Por WhatsApp no se cobra ni se piden datos de tarjeta.

### Si cancelás el alquiler

Tema: reserva-y-garantia.

El contrato de alquiler tiene una penalidad por cancelación, y cuánto es depende de cuándo cancelás: dentro de los 5 días hábiles de haber firmado el contrato, la penalidad es del 30% del total; pasado ese plazo y hasta 10 días antes de la fecha de uso, es del 70%; y desde los 9 días antes de la fecha de uso ya no hay devolución. Cuánto corresponde en cada caso lo cierra el equipo del local, porque depende de las fechas que figuran en el contrato.

### Talles

Tema: talles.

Tenemos trajes de alquiler para adultos, en talles del XS al 4XL, y también talles infantiles. Los talles de adultos van por letra. El talle justo se confirma en el local con la prueba y los ajustes de sastrería. Para niños consultá la ficha Talles infantiles. Si necesitás otra medida, un modelo o un caso especial sin confirmación, el equipo del local lo verifica; Lucía deriva sin negar disponibilidad.

### Talles infantiles: niños, nenes y chicos

Tema: talles.

Sí tenemos talles de niños del 4 al 16. Para un nene, niño o chico se puede consultar por ese rango infantil. No confundir el talle con la edad: el calce se confirma al probar. Este rango no confirma modelos, colores, precios ni stock para una fecha. Si se consulta un modelo o talle fuera de lo confirmado, derivar al equipo sin decir que no hay.

### Dónde estamos

Tema: ubicacion-horarios.

El local de alquiler queda en calle España 764, Rosario, y por ahora es el único: ahí se hace todo, la prueba, los ajustes, el retiro y la devolución. Lo mejor es venir con turno, así el equipo te dedica el tiempo que hace falta. El local abre más horas que las de los turnos de alquiler: los horarios de atención y de turnos salen de la agenda. Si te piden un teléfono, la consulta se sigue por este mismo WhatsApp: no pasamos otro contacto por acá.

### Venir sin turno

Tema: ubicacion-horarios.

Podés pasar por el local sin turno, solo a mirar los modelos. Si en ese momento hay lugar, también te podés medir y dejar tu alquiler hecho. Con turno igual es mejor: el asesor te dedica todo el tiempo que haga falta.

## Datos pendientes y precauciones al responder

- Faltan modelos, colores, fotos, precios y existencias concretas de los talles infantiles. Lucía sabe el rango 4–16; para lo demás consulta o deriva.
- Los cinco modelos cargados no tienen descripción detallada. No debe inventar tela, corte o características.
- Faltan precios de compra de accesorios.
- El catálogo no demuestra disponibilidad de una prenda para una fecha.
- La ficha de compra incluye locales físicos y un precio inicial, pero el comportamiento anterior de venta empujaba siempre hacia la web. El nuevo mensaje indica consultar la ficha; se conserva el envío del enlace de venta, evitando repetirlo.
- Las penalidades de alquiler son una política general cargada. El importe que corresponda a un caso lo decide el equipo.
- Las condiciones del negocio deben mantenerse en sus pantallas correspondientes para que una modificación no deje versiones diferentes.

## Comprobaciones

Se validaron reservas sin nombre ni correo, actualización del mismo turno, lista única, búsqueda de talles infantiles, derivación antes de negativas, cierres de cortesía y lectura de mensajes. Las comprobaciones de base usan datos ficticios y revierten los cambios. El panel compiló correctamente.

El 2 de octubre se autorizó y realizó la prueba con la IA real. Pasaron la reserva sin nombre/correo, la actualización posterior sin duplicarla, el agradecimiento sin repetición, la pregunta por horario faltante, los talles infantiles 4–16 y la derivación por producto no confirmado. Se corrigieron cuatro fallas detectadas: año ausente en el contexto, otros días presentados como cerrados, resumen perdido cuando el modelo no agregaba texto y talles infantiles confundidos con precios. También se aclaró que la fecha de visita no es la del evento.

La revisión visual completa requiere iniciar sesión. Las pruebas no enviaron WhatsApp y revirtieron todos sus datos. Esta entrega no debe interpretarse como una publicación en producción.
