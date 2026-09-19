-- 0031_turnos_aviso_y_confirmacion.sql — hito 1.16 (paneles), decisión #10 de Mateo (15/9).
--
-- Media hora antes de cada turno sale un cartel en todo el panel con los datos del turno y un
-- botón de OK (el cartel es de front, 1.17). Acá está lo que lo sostiene:
--   · configuracion_agenda.aviso_turno_min: cuántos minutos antes sale el cartel. Es dato, no
--     código (principio 2): se edita en Configuración › Agenda. El 30 está en
--     supabase/seeds/horarios_aviso_turno.sql. Vacío = sin cartel, y solo pasa antes del seed:
--     el panel no deja vaciarlo.
--   · turnos.aviso_ok_at / aviso_ok_por: cuándo y quién apretó OK. Con eso el cartel se cierra
--     para todos.
--   · turnos.confirmado_por: quién confirmó el turno. 'cliente' cuando llega el botón
--     "Confirmo" de la plantilla (logica, 1.14); el email de la persona cuando lo confirma el
--     equipo con el OK del cartel.
--   · turnos_por_avisar: los turnos que tienen el cartel abierto ahora. La ventana se define
--     una sola vez, acá: desde inicio − aviso_turno_min hasta que alguien da OK o termina el
--     turno, sin 'cancelado' ni 'no-vino'. Vista security_invoker: la RLS de turnos y de
--     configuracion_agenda sigue siendo el filtro. El GET del panel y el OK usan la misma, con
--     la hora de la base.
--   · dar_ok_aviso_turno(turno): el OK, en una sola transacción. Registra quién y cuándo; si
--     el turno seguía 'sin-confirmar' y nadie lo había confirmado, lo pasa a 'confirmado' con
--     confirmado_por = quien apretó. Si ya lo confirmó el cliente, solo registra el OK. Es una
--     acción de una persona con sesión: no choca con PROCESOS.md § 2 (el LLM nunca confirma).
--   · La firma la pone la base, como editado_por en 0017: con la sesión de un usuario del
--     panel, aviso_ok_por y confirmado_por son el email de esa sesión, diga lo que diga el
--     request. Lucía, los crons y las conexiones directas no traen usuario y escriben lo que
--     mandan (logica pone 'cliente').
-- El historial de cada OK lo deja trg_historial de turnos (0004, 0017), como cualquier edición.
-- Idempotente: correrla dos veces no falla ni duplica nada.

alter table turnos
  add column if not exists aviso_ok_at timestamptz,
  add column if not exists aviso_ok_por text,
  add column if not exists confirmado_por text;
comment on column turnos.aviso_ok_at is
  'Cuándo alguien del equipo apretó OK en el cartel del turno (decisión #10). Null = el cartel sigue abierto mientras dure la ventana.';
comment on column turnos.aviso_ok_por is
  'Email de quien apretó OK en el cartel del turno. Lo pone la base (trg_firmar_aviso).';
comment on column turnos.confirmado_por is
  '''cliente'' si confirmó con el botón de la plantilla (1.14); el email de la persona si lo confirmó el equipo con el OK del cartel.';

alter table configuracion_agenda
  add column if not exists aviso_turno_min int
    constraint configuracion_agenda_aviso_turno_min_check check (aviso_turno_min >= 1);
comment on column configuracion_agenda.aviso_turno_min is
  'Cuántos minutos antes de cada turno sale el cartel en el panel (decisión #10). Vacío = sin cartel.';

-- El panel pregunta cada 30 segundos o menos desde cada pestaña abierta.
create index if not exists turnos_sin_ok_de_aviso_idx on turnos (inicio) where aviso_ok_at is null;

create or replace view turnos_por_avisar with (security_invoker = true) as
select t.*
from turnos t
join configuracion_agenda c on c.aviso_turno_min is not null
where t.aviso_ok_at is null
  and t.estado not in ('cancelado', 'no-vino')
  and t.inicio - make_interval(mins => c.aviso_turno_min) <= now()
  and now() < t.fin;
comment on view turnos_por_avisar is
  'Turnos con el cartel abierto ahora (decisión #10): desde inicio − aviso_turno_min hasta el OK o el fin del turno, sin cancelado ni no-vino.';
revoke all on turnos_por_avisar from anon;

-- Con la sesión de un usuario del panel, la firma del OK y de la confirmación es la de la sesión.
create or replace function turnos_firmar_aviso_y_confirmacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quien text;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_quien := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);
  if TG_OP = 'INSERT' then
    if new.aviso_ok_at is not null or new.aviso_ok_por is not null then
      new.aviso_ok_at := now();
      new.aviso_ok_por := v_quien;
    end if;
    if new.confirmado_por is not null then
      new.confirmado_por := v_quien;
    end if;
  else
    if new.aviso_ok_at is distinct from old.aviso_ok_at or new.aviso_ok_por is distinct from old.aviso_ok_por then
      if new.aviso_ok_at is null then
        new.aviso_ok_por := null;
      else
        new.aviso_ok_at := now();
        new.aviso_ok_por := v_quien;
      end if;
    end if;
    if new.confirmado_por is distinct from old.confirmado_por and new.confirmado_por is not null then
      new.confirmado_por := v_quien;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_firmar_aviso on turnos;
create trigger trg_firmar_aviso before insert or update on turnos
  for each row execute function turnos_firmar_aviso_y_confirmacion();

-- El OK del cartel. security invoker: pasa por la RLS de turnos (solo aprobados). Devuelve
-- { ya_estaba, confirmo, turno }. Errores: 42501 sin sesión de usuario, P0002 si el turno no
-- existe, 55000 si no está en la ventana (todavía no, ya terminó, cancelado o no-vino), con el
-- motivo en castellano en el mensaje.
create or replace function dar_ok_aviso_turno(p_turno uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quien text := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);
  v_min int;
  v_confirma boolean;
  t turnos;
begin
  if auth.uid() is null then
    raise exception 'El OK del aviso lo da una persona con sesión en el panel' using errcode = '42501';
  end if;
  -- for update: dos OK a la vez se ordenan, y el segundo ve el primero y no lo pisa.
  select * into t from turnos where id = p_turno for update;
  if not found then
    raise exception 'El turno no existe' using errcode = 'P0002';
  end if;
  if t.aviso_ok_at is not null then
    return jsonb_build_object('ya_estaba', true, 'confirmo', false, 'turno', to_jsonb(t));
  end if;
  if t.estado in ('cancelado', 'no-vino') then
    raise exception 'El turno está %: no hay nada que avisar', t.estado using errcode = '55000';
  end if;
  if not exists (select 1 from turnos_por_avisar where id = p_turno) then
    if now() >= t.fin then
      raise exception 'El turno ya terminó' using errcode = '55000';
    end if;
    select aviso_turno_min into v_min from configuracion_agenda limit 1;
    raise exception 'Todavía no es la hora del aviso: sale % minutos antes del turno',
      coalesce(v_min::text, '(sin configurar)') using errcode = '55000';
  end if;

  v_confirma := t.estado = 'sin-confirmar' and t.confirmado_por is null;
  update turnos
     set aviso_ok_at = now(),
         aviso_ok_por = v_quien,
         estado = case when v_confirma then 'confirmado' else estado end,
         confirmado = confirmado or v_confirma,
         confirmado_at = case when v_confirma then coalesce(confirmado_at, now()) else confirmado_at end,
         confirmado_por = case when v_confirma then v_quien else confirmado_por end
   where id = p_turno
  returning * into t;
  return jsonb_build_object('ya_estaba', false, 'confirmo', v_confirma, 'turno', to_jsonb(t));
end;
$$;

revoke execute on function dar_ok_aviso_turno(uuid) from public, anon;
grant execute on function dar_ok_aviso_turno(uuid) to authenticated;
revoke execute on function turnos_firmar_aviso_y_confirmacion() from public, anon, authenticated;
