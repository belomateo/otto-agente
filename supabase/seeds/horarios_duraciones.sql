-- Configuración de agenda vigente (docs/ficha-del-negocio.md § Agenda y STACK.md § 4):
-- duraciones por tipo de turno, 3 probadores, turnos escalonados de a 15 minutos.
-- Va con la migración 0012_negocio_agenda.sql; después el dueño lo edita desde
-- Configuración › Agenda (con historial). Idempotente: no pisa lo que ya esté cargado.
insert into duraciones_turno (tipo, duracion_min) values
  ('graduado', 45),
  ('novio', 45),
  ('invitado', 45),
  ('doble', 90),
  ('triple', 120),
  ('prueba_final', 15)
on conflict (tipo) do nothing;

insert into configuracion_agenda (cantidad_probadores, escalonado_min) values (3, 15)
on conflict (unica) do nothing;
