-- 0012_negocio_agenda.sql — hito 1.9 (paneles), decisión #6 de Mateo (12/9).
--
-- Configuración de agenda como dato editable, no como número en código (principio 2):
--   · `duraciones_turno`: cuántos minutos dura cada tipo de turno.
--   · `configuracion_agenda`: cuántos probadores hay y de a cuántos minutos se escalonan
--     los turnos entre probadores. Una sola fila (columna `unica`).
-- Las dos llevan version / editado_por / editado_at y el trigger de historial, porque el
-- dueño las edita desde Configuración › Agenda (PROCESOS.md § 5). `logica` las lee en
-- H1.13 para calcular huecos; el seed con los valores de la ficha está en
-- supabase/seeds/horarios_duraciones.sql y se aplica junto con esta migración.
--
-- Además, el tope de `turnos.probador` deja de ser un número en el esquema (`between 1
-- and 3`) y pasa a validarse contra `configuracion_agenda.cantidad_probadores` con un
-- trigger: si el dueño suma un probador desde el panel, no hace falta migración.
--
-- Idempotente: correrla dos veces no falla ni duplica nada.

create table if not exists duraciones_turno (
  id uuid primary key default gen_random_uuid(),
  tipo text not null unique
    check (tipo in ('graduado', 'novio', 'invitado', 'doble', 'triple', 'prueba_final')),
  duracion_min int not null check (duracion_min > 0),
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
drop trigger if exists trg_historial on duraciones_turno;
create trigger trg_historial before update on duraciones_turno
  for each row execute function historial_antes_de_editar();

-- `unica` siempre vale true y es unique: la tabla no puede tener más de una fila.
-- (El id sigue siendo uuid para que historial_ediciones.fila_id lo pueda guardar.)
create table if not exists configuracion_agenda (
  id uuid primary key default gen_random_uuid(),
  unica boolean not null default true unique check (unica),
  cantidad_probadores int not null check (cantidad_probadores >= 1),
  escalonado_min int not null check (escalonado_min >= 1),
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
drop trigger if exists trg_historial on configuracion_agenda;
create trigger trg_historial before update on configuracion_agenda
  for each row execute function historial_antes_de_editar();

-- RLS igual que el resto de las tablas de negocio (0007): aprobados leen y escriben.
alter table duraciones_turno enable row level security;
drop policy if exists duraciones_turno_aprobados on duraciones_turno;
create policy duraciones_turno_aprobados on duraciones_turno for all
  using (es_usuario_aprobado()) with check (es_usuario_aprobado());

alter table configuracion_agenda enable row level security;
drop policy if exists configuracion_agenda_aprobados on configuracion_agenda;
create policy configuracion_agenda_aprobados on configuracion_agenda for all
  using (es_usuario_aprobado()) with check (es_usuario_aprobado());

-- El tope de probadores sale de la tabla, no del check.
alter table turnos drop constraint if exists turnos_probador_check;
alter table turnos add constraint turnos_probador_check check (probador >= 1);

create or replace function turnos_validar_probador()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max int;
begin
  select cantidad_probadores into v_max from configuracion_agenda limit 1;
  if v_max is null then
    raise exception 'configuracion_agenda está vacía: aplicá supabase/seeds/horarios_duraciones.sql'
      using errcode = 'check_violation';
  end if;
  if new.probador > v_max then
    raise exception 'el probador % no existe: la agenda tiene % probador(es)', new.probador, v_max
      using errcode = 'check_violation', constraint = 'turnos_probador_check';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_probador on turnos;
create trigger trg_validar_probador before insert or update of probador on turnos
  for each row execute function turnos_validar_probador();
