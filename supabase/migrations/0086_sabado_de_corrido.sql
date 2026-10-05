-- Sábado de corrido (Mateo, 5/10): "si es de corrido" también para los turnos. Las franjas del
-- sábado tenían un hueco sin turnos (de 12 a 13:15). Se corre el límite a las 12:30, sin tocar
-- cuántos probadores hay en cada tramo (3 a la mañana, 2 a la tarde): así los turnos de 45
-- minutos siguen cayendo en los mismos horarios de siempre (9:30, 10:15, 11:00, 13:15, 14:00…) y
-- se suman 11:45 y 12:30. Los turnos ya dados para el sábado 10/10 quedan todos adentro.
-- Primero la mañana (se estira hasta 12:30) y después la tarde (arranca 12:30): las franjas no
-- se pueden pisar (franjas_turnos_sin_solapamiento).
update franjas_turnos set hasta = '12:30', editado_por = 'Mateo 5/10: sábado de corrido', editado_at = now()
 where id = '96c0c5ec-6a25-4f19-901e-8a56c4bd2f43' and dia_semana = 6;
update franjas_turnos set desde = '12:30', editado_por = 'Mateo 5/10: sábado de corrido', editado_at = now()
 where id = '087fa142-a5a3-47e8-b849-7617b88d0263' and dia_semana = 6;
