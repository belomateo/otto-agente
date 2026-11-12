-- 0119_bloqueos_solo_admin.sql — 12/11 (Mateo: «solo Sofía y yo podemos hacer eso»). Bloquear un horario o un
-- probador, editarlo o quitarlo pasa a ser solo de los administradores (es_admin(): hoy Sofía y Mateo). El equipo
-- sigue VIENDO los bloqueos (lectura igual que en 0067). Lucía no escribe en esta tabla.
-- Idempotente.

drop policy if exists bloqueos_agenda_alta on bloqueos_agenda;
create policy bloqueos_agenda_alta on bloqueos_agenda for insert to authenticated
  with check (es_admin());

drop policy if exists bloqueos_agenda_edicion on bloqueos_agenda;
create policy bloqueos_agenda_edicion on bloqueos_agenda for update to authenticated
  using (es_admin()) with check (es_admin());

drop policy if exists bloqueos_agenda_borrado on bloqueos_agenda;
create policy bloqueos_agenda_borrado on bloqueos_agenda for delete to authenticated
  using (es_admin());
