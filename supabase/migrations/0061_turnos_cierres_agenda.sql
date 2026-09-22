-- 0061_turnos_cierres_agenda.sql — pedido de Mateo (21/9, via logica): hoy solo hay horario
-- SEMANAL (0003, tabla horarios/franjas_turnos por dia_semana) — no hay forma de marcar una
-- fecha puntual cerrada (feriado, cierre excepcional) sin tocar el horario de todo ese día de
-- la semana para siempre. cierres_agenda es la fecha puntual: calcularHuecos() (compartida con
-- el agente, _shared/agenda/huecos.ts, de logica) la va a recibir como una fecha más a excluir,
-- coordinado aparte con ese rol — esta migración es solo la tabla y quién puede tocarla.
--
-- Mismo patrón de RLS que duraciones_turno/configuracion_agenda (0033/0045): cualquier aprobado
-- necesita LEER esto para calcular huecos al armar un turno nuevo (equipo incluido, ve Turnos),
-- pero solo un admin lo escribe — es una decisión de negocio (cerrar el local), no operativa.
create table cierres_agenda (
  fecha date primary key,
  motivo text,
  creado_por uuid references perfiles(id),
  creado_at timestamptz not null default now()
);

alter table cierres_agenda enable row level security;
create policy cierres_agenda_lectura on cierres_agenda for select
  using (es_usuario_aprobado());
create policy cierres_agenda_admin_escribe on cierres_agenda for insert
  with check (es_admin());
create policy cierres_agenda_admin_borra on cierres_agenda for delete
  using (es_admin());
