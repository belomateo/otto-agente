-- Correcciones de Mateo y Sofi (30/9) que viven en la base, no en la plantilla del prompt.
-- Regla 10: dónde se alquila y dónde se compra.
-- Regla 14: la vieja ("toda charla termina con una propuesta de turno") contradice el pedido
--   de que Lucía atienda consultas primero y ofrezca el turno solo cuando corresponde.
-- Fragmento de compra: precio desde el que arranca, web y los tres locales, venta sin turno.
UPDATE reglas_agente
   SET texto = 'Nunca ofrecés envío ni alquiler fuera de Rosario. El alquiler (con turno) es en España 764. La compra de trajes (sin turno) se puede hacer en Córdoba 1369, Rioja 1615 o España 764.',
       editado_por = 'Mateo 30/9'
 WHERE numero = 10;

UPDATE reglas_agente
   SET texto = 'El turno lo ofrecés una vez, cuando la charla llega a ese punto, no en cada mensaje. Si el cliente está consultando nomás, contestá y dejá que decida.',
       editado_por = 'Mateo 30/9'
 WHERE numero = 14;

UPDATE fragmentos
   SET texto = 'Mr Otto también vende trajes, no solo alquila. Los trajes para compra arrancan desde $540.000, y algunos modelos se pueden ver en la web www.mrotto.com.ar. La compra se hace en persona y sin turno, en cualquiera de los locales de Rosario: Córdoba 1369, Rioja 1615 o España 764. El alquiler es distinto y lo maneja Lucía directamente por acá: turnos, medidas y trajes a medida, así que si lo suyo es alquilar, sigue la charla normal.',
       editado_por = 'Mateo 30/9'
 WHERE id = 'a9f10000-0000-4000-8000-000000001202';
