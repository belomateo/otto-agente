-- Franjas de turnos y reserva de urgencia (decisiones #7 y #9 de Mateo, 14/9, con las notas
-- de Otto España; docs/ficha-del-negocio.md § Agenda y docs/supuestos.md #5, #20 y #21):
--   · Lunes a viernes de 13:00 a 19:00 con 3 probadores (a la mañana no se dan turnos).
--   · Sábado de 09:30 a 12:00 con 3 y de 13:30 a 18:30 con 2.
--   · Domingo sin filas: no se dan turnos.
--   · dias_reserva_urgencia = 7 (el mínimo de anticipación recomendado de la ficha).
-- Va con 0030_negocio_franjas_turnos.sql y después de horarios_duraciones.sql (cada franja
-- se valida contra configuracion_agenda.cantidad_probadores). Después lo edita el dueño
-- desde Configuración › Agenda, con historial.
-- Idempotente: carga una sola vez, cuando todavía no hay ninguna franja. Correrlo de nuevo
-- no pisa lo que ya esté cargado o editado.
do $$
begin
  if exists (select 1 from franjas_turnos) then
    return;
  end if;

  insert into franjas_turnos (dia_semana, desde, hasta, probadores) values
    (1, '13:00', '19:00', 3),
    (2, '13:00', '19:00', 3),
    (3, '13:00', '19:00', 3),
    (4, '13:00', '19:00', 3),
    (5, '13:00', '19:00', 3),
    (6, '09:30', '12:00', 3),
    (6, '13:30', '18:30', 2);

  -- Deja su versión en el historial como cualquier edición, firmada 'seed'.
  update configuracion_agenda
     set dias_reserva_urgencia = 7, editado_por = 'seed'
   where dias_reserva_urgencia is null;
end $$;
