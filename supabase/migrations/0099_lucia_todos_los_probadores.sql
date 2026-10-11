-- 0099_lucia_todos_los_probadores.sql — pedido de Mateo del 10/10 (trabajo 4, agenda). Idempotente.
--
-- Lucía vuelve a dar turnos en todos los probadores. Desde el 30/9 (0073, pedido de Sofía:
-- «el probador 3 quede solo para urgencias») configuracion_agenda.probadores_lucia = 2 le dejaba
-- a Lucía solo los dos probadores de abajo; el de arriba quedaba para que el equipo agendara a
-- mano. En la práctica, con los dos de abajo tomados, Lucía decía que no había lugar —o pasaba la
-- charla— en horarios que el equipo después daba en el tercero. Mateo aprobó que Lucía los dé
-- todos.
--
-- null = sin tope: leerReglas (supabase/functions/_shared/agenda/huecos.ts) deja cada franja con
-- los probadores que el equipo le cargó en Configuración › Agenda (al 2/10, el tercero estaba en
-- las tardes de semana y en la mañana del sábado). La columna se queda: volver a poner un número
-- es volver a reservar los de arriba para el equipo, sin tocar código. El panel sigue viendo y
-- usando todos, como siempre.
--
-- version la sube igual el trigger de historial (historial_antes_de_editar); se escribe como en
-- 0098 para que se lea en la migración. editado_por deja el porqué en el historial del panel.
update configuracion_agenda
   set probadores_lucia = null,
       version = version + 1,
       editado_por = 'Mateo 10/10: Lucía da turnos en todos los probadores'
 where probadores_lucia is not null;
