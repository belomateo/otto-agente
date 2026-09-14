-- 0030_negocio_franjas_turnos.sql — paneles, decisiones #7 y #9 de Mateo (14/9, con las
-- notas de Otto España). Rango de paneles para esto: 0030–0039.
--
-- #7: los turnos se dan por franjas, no en todo el horario del local. De lunes a viernes de
-- 13 a 19 con 3 probadores; el sábado de 9:30 a 12 con 3 y de 13:30 a 18:30 con 2. Con un
-- horario por día y una cantidad fija de probadores eso no se puede guardar, así que:
--   · `franjas_turnos`: una fila por franja (varias por día), cada una con cuántos probadores
--     toman turnos. En una franja con P probadores toman turnos los probadores 1 a P
--     (supuesto #22). Un día sin filas no da turnos (el domingo). `logica` calcula los huecos
--     desde acá (H1.13).
--   · `horarios` queda como horario del local (atención humana, avisos fuera de horario): sus
--     columnas de corte ya no se usan para turnos.
-- #9: los turnos se dan por orden de urgencia. `configuracion_agenda.dias_reserva_urgencia`:
--   los huecos de los próximos N días quedan para los eventos que caen dentro de esos N días
--   (supuesto #21). Vacío = sin reserva. `logica` lo aplica en buscar_horarios.
--
-- Reglas que pone la base, no el panel (así las cumple también quien escriba por la API):
-- las franjas de un mismo día no se pisan (EXCLUDE, 23P01), cada una termina después de
-- empezar, y ninguna pide más probadores que configuracion_agenda.cantidad_probadores (en
-- los dos sentidos: ni una franja con más, ni bajar la cantidad por debajo de una franja).
--
-- Historial: como el resto de lo que edita el dueño (0003, 0017), con version / editado_por
-- / editado_at y los triggers trg_historial y trg_autoria. Como una franja además se borra
-- (partir un día en dos, dejar de dar turnos el sábado a la tarde), borrarla también deja su
-- fila en historial_ediciones: la versión borrada, con quién y cuándo la borró dentro de
-- datos_anteriores (borrado_por, borrado_at), para poder volver a crearla.
--
-- Los valores (las franjas y los 7 días) están en supabase/seeds/horarios_franjas.sql, que
-- se aplica junto con esta migración, después de horarios_duraciones.sql.
-- Idempotente: correrla dos veces no falla ni duplica nada.

-- #9 ---------------------------------------------------------------------------------------
alter table configuracion_agenda
  add column if not exists dias_reserva_urgencia int
    constraint configuracion_agenda_dias_reserva_urgencia_check check (dias_reserva_urgencia >= 1);
comment on column configuracion_agenda.dias_reserva_urgencia is
  'Orden de urgencia (decisión #9, supuesto #21): los huecos de los próximos N días quedan para los eventos que caen dentro de esos N días. Vacío = sin reserva.';

-- #7 ---------------------------------------------------------------------------------------
-- dia_semana como en `horarios` y extract(dow): 0 = domingo … 6 = sábado.
-- La franja es [desde, hasta): una que termina a las 12 y otra que empieza a las 12 no se
-- pisan. El rango se arma sobre una fecha fija porque Postgres no trae un rango de `time`;
-- date + time es inmutable, así que sirve para el EXCLUDE (btree_gist ya está, 0011).
create table if not exists franjas_turnos (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6),
  desde time not null,
  hasta time not null,
  probadores int not null check (probadores >= 1),
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now(),
  constraint franjas_turnos_desde_antes_de_hasta check (desde < hasta),
  constraint franjas_turnos_sin_solapamiento exclude using gist (
    dia_semana with =,
    tsrange(date '2000-01-01' + desde, date '2000-01-01' + hasta, '[)') with &&
  )
);
comment on table franjas_turnos is
  'Franjas en las que se dan turnos (decisión #7 del 14/9). Varias por día; en una franja con P probadores toman turnos los probadores 1 a P. Día sin filas = sin turnos. El horario del local es otra cosa: tabla horarios.';
comment on column horarios.corte_desde is
  'Horario del local. Desde 0030 los turnos salen de franjas_turnos: el corte ya no se usa para turnos.';
comment on column horarios.corte_hasta is
  'Horario del local. Desde 0030 los turnos salen de franjas_turnos: el corte ya no se usa para turnos.';

drop trigger if exists trg_historial on franjas_turnos;
create trigger trg_historial before update on franjas_turnos
  for each row execute function historial_antes_de_editar();

drop trigger if exists trg_autoria on franjas_turnos;
create trigger trg_autoria before insert or update on franjas_turnos
  for each row execute function autoria_de_sesion();

-- Borrar deja la versión borrada en el historial. Mismo criterio que 0017: security definer
-- porque historial_ediciones no deja insertar a authenticated, y el contenido sale de OLD y
-- de la sesión, no del request. Los tres campos de autoría de la fila de historial siguen
-- siendo los de la versión (OLD); quién borró va aparte, en datos_anteriores.
create or replace function historial_antes_de_borrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into historial_ediciones(tabla, fila_id, version, datos_anteriores, editado_por, editado_at)
  values (
    TG_TABLE_NAME, OLD.id, OLD.version,
    to_jsonb(OLD) || jsonb_build_object(
      'borrado_por', coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text),
      'borrado_at', now()
    ),
    OLD.editado_por, OLD.editado_at
  );
  return OLD;
end;
$$;

drop trigger if exists trg_historial_borrado on franjas_turnos;
create trigger trg_historial_borrado before delete on franjas_turnos
  for each row execute function historial_antes_de_borrar();

-- Una franja no pide más probadores que los que tiene el local. El `for share` sobre la
-- configuración hace que una franja nueva y una baja de probadores simultáneas no pasen las
-- dos: la segunda espera a la primera y chequea contra lo que quedó.
create or replace function franjas_validar_probadores()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max int;
begin
  select cantidad_probadores into v_max from configuracion_agenda limit 1 for share;
  if v_max is null then
    raise exception 'configuracion_agenda está vacía: aplicá supabase/seeds/horarios_duraciones.sql'
      using errcode = 'check_violation';
  end if;
  if new.probadores > v_max then
    raise exception 'la franja pide % probador(es) y la agenda tiene %', new.probadores, v_max
      using errcode = 'check_violation', constraint = 'franjas_turnos_probadores_check';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_probadores on franjas_turnos;
create trigger trg_validar_probadores before insert or update of probadores on franjas_turnos
  for each row execute function franjas_validar_probadores();

-- Y al revés: la cantidad de probadores no baja por debajo de la franja que más pide.
create or replace function configuracion_validar_franjas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max int;
begin
  select max(probadores) into v_max from franjas_turnos;
  if v_max is not null and new.cantidad_probadores < v_max then
    raise exception 'hay franjas con % probador(es): bajalas antes de dejar la agenda en %',
      v_max, new.cantidad_probadores
      using errcode = 'check_violation', constraint = 'configuracion_agenda_cantidad_probadores_check';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_franjas on configuracion_agenda;
create trigger trg_validar_franjas before update of cantidad_probadores on configuracion_agenda
  for each row execute function configuracion_validar_franjas();

-- RLS igual que 0012: aprobados leen y escriben.
alter table franjas_turnos enable row level security;
drop policy if exists franjas_turnos_aprobados on franjas_turnos;
create policy franjas_turnos_aprobados on franjas_turnos for all
  using (es_usuario_aprobado()) with check (es_usuario_aprobado());

-- Funciones de trigger: nadie las llama por la API (como en 0017).
revoke execute on function historial_antes_de_borrar() from public, anon, authenticated;
revoke execute on function franjas_validar_probadores() from public, anon, authenticated;
revoke execute on function configuracion_validar_franjas() from public, anon, authenticated;
