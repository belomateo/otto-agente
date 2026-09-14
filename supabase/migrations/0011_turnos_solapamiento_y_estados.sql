-- 0011_turnos_solapamiento_y_estados.sql — hito 1.9 (paneles), decisiones #1 y #2 de
-- Mateo (12/9) sobre el informe del verificador de Fase 0 (§ 3.3 y § 3.4).
--
-- #1 Solapamiento: dos turnos del mismo probador no pueden pisarse. Antes había solo un
--    índice; el cálculo de huecos en código (H1.13) deja una ventana entre el chequeo y el
--    insert. Ahora lo garantiza la base con EXCLUDE (btree_gist para el `=` de probador).
--    Los turnos 'cancelado' y 'no-vino' liberan el hueco; el resto lo ocupa.
-- #2 Estados: se suman 'cancelado' y 'no-vino' (cancelar ya no es borrar la fila) y
--    'con-aviso' deja de ser un estado: era un aviso de sincronización con Google
--    Calendar y pisaba el estado real. Pasa a la columna `aviso` (null = sin aviso), que
--    logica escribe y limpia en H1.12.
-- Además: `cancelado_at` y `motivo_cancelacion`, porque cancelar_turno (AGENTE.md § 4)
-- "marca cancelado y anota motivo" y necesita dónde dejarlo.
--
-- Idempotente: correrla dos veces no falla ni duplica nada.

create extension if not exists btree_gist with schema extensions;

alter table turnos
  add column if not exists aviso text,
  add column if not exists cancelado_at timestamptz,
  add column if not exists motivo_cancelacion text;

-- Si alguna fila quedó con el estado viejo, el aviso pasa a su columna y el estado
-- vuelve al inicial (hoy no hay ninguna; queda por si se corre sobre otra base).
update turnos
   set aviso = coalesce(aviso, 'Sin sincronizar con Google Calendar'),
       estado = 'sin-confirmar'
 where estado = 'con-aviso';

alter table turnos drop constraint if exists turnos_estado_check;
alter table turnos add constraint turnos_estado_check
  check (estado in ('sin-confirmar', 'confirmado', 'alquilo', 'retiro', 'devolvio', 'cancelado', 'no-vino'));

-- Rango semiabierto [inicio, fin): un turno que termina 10:45 y otro que empieza 10:45
-- en el mismo probador no se pisan.
alter table turnos drop constraint if exists turnos_sin_solapamiento;
alter table turnos add constraint turnos_sin_solapamiento
  exclude using gist (probador with =, tstzrange(inicio, fin, '[)') with &&)
  where (estado not in ('cancelado', 'no-vino'));

-- Al pasar a 'cancelado' queda la hora, en código y no a criterio de quien edita.
create or replace function turnos_marcar_cancelacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    new.cancelado_at := coalesce(new.cancelado_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_marcar_cancelacion on turnos;
create trigger trg_marcar_cancelacion before update of estado on turnos
  for each row execute function turnos_marcar_cancelacion();
