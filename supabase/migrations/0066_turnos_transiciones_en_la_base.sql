-- 0066_turnos_transiciones_en_la_base.sql — hallazgo de la auditoría de logica (22/9): la
-- máquina de estados del turno (entidades.ts, panel/lib/edicion) solo vivía en TypeScript.
-- turnos tiene RLS abierta a "cualquier aprobado" a propósito (0007/0033/0040/0045: es trabajo
-- diario) — un 'equipo' con su propio token podía saltear la ruta del panel y pegarle directo a
-- PostgREST, poniendo cualquier estado sin respetar ninguna transición.
--
-- Transiciones válidas, juntando TODO lo que de verdad escribe turnos.estado (no solo el panel):
--   · panel (entidades.ts, PATCH /api/turnos/{id}): alquilo/retiro/devolvio/no-vino/cancelado.
--   · dar_ok_aviso_turno() (0031) y turno_confirmar_por_boton() (0021): sin-confirmar → confirmado.
--   · reprogramar_turno.ts (agente, logica): confirmado → sin-confirmar (mover el turno resetea
--     la confirmación) — sin esto, esta migración le rompía la reprogramación al agente.
--   · cancelar_turno.ts (agente, logica): mismo cancelado que el panel, con motivo.
--
-- No aplica a INSERT (el turno nace en 'sin-confirmar', eso lo pone el alta) ni a un UPDATE que
-- no toca estado (editar motivo_cancelacion solo, por ejemplo, sigue permitido).
--
-- Solo corre para el rol 'authenticated' (con el que PostgREST atiende una sesión real del
-- panel, admin o equipo) — no para 'postgres' (migraciones, arneses de prueba que arman un
-- estado puntual a mano para probar OTRA cosa, como tests/sql/run.mjs) ni 'service_role' (ya
-- pasa por encima de RLS, es igual de confiable). Mismo criterio que ya usa RLS en toda la base:
-- lo que hay que cerrar es la ventana de "un equipo con su propio token, saltando el panel", no
-- lo que corre con permisos de sistema.
create or replace function turnos_transicion_valida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  if not (
    (new.estado = 'confirmado' and old.estado = 'sin-confirmar') or
    (new.estado = 'sin-confirmar' and old.estado = 'confirmado') or
    (new.estado = 'alquilo' and old.estado in ('sin-confirmar', 'confirmado')) or
    (new.estado = 'retiro' and old.estado = 'alquilo') or
    (new.estado = 'devolvio' and old.estado = 'retiro') or
    (new.estado = 'no-vino' and old.estado in ('sin-confirmar', 'confirmado')) or
    (new.estado = 'cancelado' and old.estado in ('sin-confirmar', 'confirmado', 'alquilo', 'retiro'))
  ) then
    raise exception 'no se puede pasar de "%" a "%"', old.estado, new.estado using errcode = '23514';
  end if;

  if new.estado = 'cancelado' and coalesce(trim(new.motivo_cancelacion), '') = '' then
    raise exception 'cancelar un turno necesita un motivo' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_turnos_transicion on turnos;
create trigger trg_turnos_transicion before update on turnos
  for each row execute function turnos_transicion_valida();
