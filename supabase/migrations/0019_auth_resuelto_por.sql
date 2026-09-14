-- 0019_auth_resuelto_por.sql — hito 1.10 (paneles).
--
-- solicitudes_acceso.resuelto_por (0010) referencia perfiles sin acción al borrar. Como
-- borrar una cuenta de auth.users borra su perfil en cascada, borrar la cuenta de un admin
-- que alguna vez aprobó o rechazó a alguien fallaba con "Database error deleting user", un
-- error que no le dice a nadie qué pasa (lo encontró la limpieza de la prueba de H1.10).
-- Ahora, al borrar esa cuenta, la solicitud se conserva (estado y resuelto_at) y
-- resuelto_por pasa a null.
-- Idempotente.

alter table solicitudes_acceso drop constraint if exists solicitudes_acceso_resuelto_por_fkey;
alter table solicitudes_acceso add constraint solicitudes_acceso_resuelto_por_fkey
  foreign key (resuelto_por) references perfiles(id) on delete set null;
