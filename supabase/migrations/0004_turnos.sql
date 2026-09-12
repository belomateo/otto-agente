-- 0004_turnos.sql — turnos agendados por Lucía (o por el equipo desde el panel).
-- estado usa los mismos valores kebab que ya consume el componente ui-otto/BloqueTurno.tsx
-- del panel (H1.1/H1.2, ya construido): sin dejarlos iguales, Fase 2 (conectar el panel
-- a datos reales) rompería esa UI. Es una excepción puntual a la regla general de
-- TRABAJO.md § 5 ("los enums de estado van en snake_case"); queda anotada en docs/supuestos.md.
create table turnos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  tipo text not null
    check (tipo in ('graduado', 'novio', 'invitado', 'doble', 'triple', 'prueba_final')),
  duracion_min int not null,
  probador int not null check (probador between 1 and 3),
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text not null default 'sin-confirmar'
    check (estado in ('sin-confirmar', 'confirmado', 'alquilo', 'retiro', 'devolvio', 'con-aviso')),
  google_event_id text,
  recordatorio_enviado_at timestamptz,
  confirmado boolean not null default false,
  confirmado_at timestamptz,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now(),
  creado_at timestamptz not null default now(),
  check (fin > inicio)
);
create index turnos_probador_inicio_idx on turnos(probador, inicio);
create index turnos_cliente_id_idx on turnos(cliente_id);
create index turnos_estado_idx on turnos(estado);

create trigger trg_historial before update on turnos
  for each row execute function historial_antes_de_editar();
