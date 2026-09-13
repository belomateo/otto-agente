-- Horario vigente (docs/ficha-del-negocio.md § Agenda, "OTTO BOT, vigente").
-- dia_semana: 0 domingo … 6 sábado. Lunes a viernes 10–19; el domingo, cerrado (sin fila).
insert into horarios (dia_semana, hora_apertura, hora_cierre, corte_desde, corte_hasta) values
  (1, '10:00', '19:00', '14:00', '15:00'),
  (2, '10:00', '19:00', '14:00', '15:00'),
  (3, '10:00', '19:00', '14:00', '15:00'),
  (4, '10:00', '19:00', '14:00', '15:00'),
  (5, '10:00', '19:00', '14:00', '15:00'),
  (6, '09:30', '18:30', null, null)
on conflict (dia_semana) do nothing;
