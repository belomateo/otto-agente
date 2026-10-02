-- Continuación del pedido del 1/10. Aplicar después de 0074 y junto al worker.
UPDATE reglas_agente
   SET texto = 'Agendás con teléfono, fecha y hora elegidas, comprobando disponibilidad. Nombre y correo son opcionales: los pedís después de reservar y, cuando llegan, actualizás la misma reserva con guardar_datos_cliente. El sistema manda una sola lista de datos al reservar y al actualizarlos; no la repitas ni inventes datos.',
       editado_por = 'Mateo: resumen de reserva y datos opcionales'
 WHERE numero = 5;

UPDATE herramientas_agente SET descripcion = ''
 WHERE nombre IN ('agendar_turno', 'buscar_horarios', 'guardar_datos_cliente', 'reprogramar_turno');

UPDATE prompt_base SET texto = replace(replace(replace(replace(replace(texto, E'\r\n', E'\n'),
'Para agendar alcanza con nombre, teléfono de la charla y fecha y hora elegidas.',
'Para agendar alcanza con teléfono de la charla y fecha y hora elegidas.'),
'en este mismo turno si está libre, sin esperar evento, mail ni otra confirmación.',
'en este mismo turno si está libre, sin esperar nombre, evento, mail ni otra confirmación.'),
'Para reservar no esperes completar la ficha: alcanza con nombre, teléfono y fecha',
'Para reservar no esperes completar la ficha: alcanza con teléfono y fecha'),
$antes$9. Apenas agendás, la confirmación con el día, la hora, la dirección, el mapa y las
   condiciones le llega sola, en un mensaje aparte que no escribís vos: no la repitas ni
   la reescribas. Tu mensaje es corto y cálido.$antes$,
$despues$9. Al agendar sale una sola lista: Nombre, Número, Día y hora, Gmail. Lo que falta
   dice «No especificado» y se pide nombre/correo después de reservar. Si los envía,
   usá guardar_datos_cliente: actualiza la misma reserva y manda la lista actualizada.
   No repitas esa lista ni su pregunta. Gmail admite cualquier correo, no solo Gmail.$despues$),
editado_at = now() WHERE unica = true;

UPDATE prompt_base SET texto = replace(texto,
$antes$   reales dentro del horario del local. Ofrecé dos, nunca más de tres. Si te
   devuelve pedir_mail: true, pedile el mail en ese mismo mensaje, junto con los
   horarios (una pregunta más, no un mensaje aparte), y guardalo apenas te lo
   diga. Esto pasa como mucho una vez por charla: si no te vuelve a devolver
   pedir_mail: true, YA LO PEDISTE, así que no lo menciones de nuevo bajo ningún
   motivo. El mail nunca frena una reserva: si el cliente contesta cualquier
   cosa que no sea un mail —incluido confirmar el turno, un "dale" o cambiar de
   tema— agendá igual con lo que tenés y seguí. Nunca le vuelvas a pedir el mail
   en el mismo turno en que está confirmando.$antes$,
$despues$   reales dentro del horario del local. Ofrecé dos, nunca más de tres.
   No pidas nombre ni correo antes de reservar: se piden al pie del resumen
   del turno ya guardado, solo si faltan. Si los da, guardalos inmediatamente.$despues$),
editado_at = now() WHERE unica = true;
