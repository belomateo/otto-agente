-- 0014_negocio_historial_enlaces_notas.sql — hito 1.9 (paneles). `enlaces` y
-- `notas_dueno` (0003) se editan desde Configuración › Enlaces y › Notas (PROCESOS.md
-- § 5) pero nacieron sin version / editado_por / editado_at ni trigger de historial, que
-- TRABAJO.md § 5 exige para todo dato que el dueño edita. Se les suma lo que les falta.
-- `notas_dueno` gana además `activo`, para poder sacar una nota del prompt sin borrarla.
-- Idempotente.

alter table enlaces
  add column if not exists version int not null default 1,
  add column if not exists editado_por text,
  add column if not exists editado_at timestamptz not null default now();
drop trigger if exists trg_historial on enlaces;
create trigger trg_historial before update on enlaces
  for each row execute function historial_antes_de_editar();

alter table notas_dueno
  add column if not exists activo boolean not null default true,
  add column if not exists version int not null default 1,
  add column if not exists editado_por text,
  add column if not exists editado_at timestamptz not null default now();
drop trigger if exists trg_historial on notas_dueno;
create trigger trg_historial before update on notas_dueno
  for each row execute function historial_antes_de_editar();
