-- 0115_textos_seguimiento.sql — 10/11. Los textos del seguimiento de 23 hs dejan de ser un «¿te sirvió?» a secas:
-- piden el día y la franja (mañana o tarde) y nombran el evento. Solo se pisan los que todavía son los de 0111
-- (si alguien los editó en Configuración, quedan como están).
-- APLICAR DESPUÉS de publicar la función cron-envios nueva (la que reemplaza {evento}); antes, saldría literal.
-- Idempotente.

-- {evento} se reemplaza por «Tu evento es el sábado 12 de diciembre.» si la ficha tiene una fecha que no pasó,
-- y desaparece si no.
update contexto_agente set valor = 'Hola {nombre}! Para dejarte reservado un horario me falta saber para qué fecha necesitás el traje. Me contás? 😊'
 where clave = 'texto_seguimiento_sin_fecha'
   and valor = 'Hola {nombre}! Quedó pendiente saber para qué fecha necesitás el traje, así te busco el mejor horario para venir a probártelo. Me contás? 😊';
update contexto_agente set valor = 'Hola {nombre}! {evento} Todavía no tenés la visita reservada: decime qué días te quedan cómodos, a la mañana o a la tarde, y te busco el horario.'
 where clave = 'texto_seguimiento_con_fecha'
   and valor = 'Hola {nombre}! Te busco un turno para venir a probarte? Decime qué días te quedan cómodos y lo coordinamos.';
update contexto_agente set valor = 'Hola {nombre}! Te sirvió alguno de los horarios que te pasé? {evento} Si ninguno te viene bien, decime qué días te quedan cómodos, a la mañana o a la tarde, y te busco otros.'
 where clave = 'texto_seguimiento_horarios'
   and valor = 'Hola {nombre}! Te sirvió alguno de los horarios que te pasé? Si ninguno te viene bien, decime qué días te quedan cómodos y lo vemos.';
update contexto_agente set valor = 'Hola {nombre}! Pudiste pensarlo? {evento} Si te quedó alguna duda, contame y te ayudo. 😊'
 where clave = 'texto_seguimiento_consulta'
   and valor = 'Hola {nombre}! Pudiste pensarlo? Si te quedó alguna duda, contame y te ayudo. 😊';
