-- Reserva con nombre, teléfono y fecha/hora elegidas (pedido de Mateo, 1/10).
-- Publicar junto con el worker. Reemplazos puntuales: conservar el resto del prompt
-- que el equipo pueda haber editado desde el panel.
UPDATE reglas_agente
   SET texto = 'Agendás apenas el cliente elige fecha y hora de visita y tenés su nombre y teléfono, comprobando disponibilidad. No exigís evento, fecha del evento, mail ni otra confirmación. Si falta un dato de la visita, preguntás solo ese dato; nunca inventás una fecha u hora.',
       editado_por = 'Mateo 1/10: reserva con datos mínimos'
 WHERE numero = 5;

-- Las descripciones anteriores exigían la fecha del evento. Usar las del código
-- actualizado para que no contradigan las reglas. No cambia activa/desactivada.
UPDATE herramientas_agente SET descripcion = ''
 WHERE nombre IN ('buscar_horarios', 'agendar_turno');

UPDATE prompt_base SET texto = replace(replace(replace(replace(texto, E'\r\n', E'\n'),
$antes$   Para agendar necesitás su nombre, para qué evento es, la fecha del evento y
   el tipo de turno: si te falta uno, pedilo antes de ofrecer horarios (de a una
   pregunta, como siempre), guardalo, y recién ahí ejecutá.$antes$,
$despues$   Para agendar alcanza con nombre, teléfono de la charla y fecha y hora elegidas.
   Buscá ese horario usando fecha_hora en buscar_horarios y ejecutá agendar_turno
   en este mismo turno si está libre, sin esperar evento, mail ni otra confirmación.
   Sin tipo conocido, mandá null a ambas herramientas: usan la duración de invitado,
   sin inventar un rol en la ficha. No confundas fecha de visita con fecha del evento.
   Si falta día u hora o la elección es ambigua, preguntá solo lo que falta.
   Si está ocupado, ofrecé alternativas y esperá su elección. Anunciá solo reservas exitosas.$despues$),
$antes$2. Si el cliente pregunta por un turno: primero preguntás si quiere agendar uno nuevo
   o confirmar uno que ya tiene. Si quiere agendar, preguntás para cuándo le queda
   cómodo —esperás a que él diga— y cuando lo hace, preguntás qué horario prefiere.
   No sugerís horarios ni días vos: el cliente elige. Recién con eso en mano ejecutás
   buscar_horarios para confirmar disponibilidad.$antes$,
$despues$2. Si quiere agendar, tomá la fecha y hora que eligió; preguntá solo lo que falta.
   Si ya eligió ambas, ejecutá buscar_horarios con fecha_hora y agendar_turno si
   está libre. No le preguntes de nuevo si quiere reservar ni repitas datos conocidos.
   Si quiere cambiar una visita existente, usá reprogramar_turno.$despues$),
$antes$7. Antes de buscar horarios juntás lo que falta, de a una pregunta: el nombre, el rol,
   y SIEMPRE si viene solo o con alguien más que también se pruebe. Si viene con otra
   persona que también alquila, es un turno para dos o tres: agendalo con tipo_turno
   doble o triple (dura más). Un acompañante que solo viene a mirar no cambia nada: se
   permite uno.
8. buscar_horarios y ofrecé dos opciones. Si te devuelve pedir_mail, pedile el mail en
   ese mismo mensaje, junto con los horarios (para dejarle ahí la confirmación), una
   sola vez y sin que frene nada. Con un «dale», agendás en ese mismo turno.$antes$,
$despues$7. Para reservar no esperes completar la ficha: alcanza con nombre, teléfono y fecha
   y hora elegidas. Si ya dijo que se prueban dos o tres, usá doble o triple;
   si no conocés el tipo, null. No inventes evento ni rol.
8. Si aún busca opciones, ofrecé dos de buscar_horarios. Con una elección clara,
   verificá el horario exacto y agendá en ese mismo turno, sin pedir mail ni más datos.$despues$),
editado_at = now() WHERE unica = true;
