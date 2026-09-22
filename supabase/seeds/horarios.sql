-- Horario vigente (docs/ficha-del-negocio.md § Agenda, "OTTO BOT, vigente").
-- dia_semana: 0 domingo … 6 sábado. Lunes a viernes 10–19. El domingo tiene su propia fila con
-- activo=false (pedido de Mateo, 21/9): antes no tenía fila, y eso era ambiguo — no se sabía si
-- estaba cerrado a propósito o si faltaba cargarlo. Explícito y no va a cambiar, según Mateo.
-- Ojo: esto es agenda (no ofrece huecos ese día), no un interruptor — Lucía sigue atendiendo los
-- domingos, solo que no agenda para ese mismo día.
insert into horarios (dia_semana, hora_apertura, hora_cierre, corte_desde, corte_hasta, activo) values
  (0, '10:00', '19:00', null, null, false),
  (1, '10:00', '19:00', '14:00', '15:00', true),
  (2, '10:00', '19:00', '14:00', '15:00', true),
  (3, '10:00', '19:00', '14:00', '15:00', true),
  (4, '10:00', '19:00', '14:00', '15:00', true),
  (5, '10:00', '19:00', '14:00', '15:00', true),
  (6, '09:30', '18:30', null, null, true)
on conflict (dia_semana) do nothing;
