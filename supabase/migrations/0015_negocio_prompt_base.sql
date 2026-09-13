-- 0015_negocio_prompt_base.sql — hito 1.9 (paneles). Dónde vive el prompt base que el
-- dueño edita desde Configuración › Lucía › Avanzado (PROCESOS.md § 5).
--
-- El prompt de Lucía es un archivo generado (`_shared/prompt.md`) a partir de una
-- plantilla + reglas_agente + contexto_agente (scripts/armar-prompt.mjs, rol `agente`,
-- H1.3). La plantilla es el "prompt base": para que el dueño la edite con historial y
-- "volver a la versión anterior", su fuente vigente se guarda acá, una sola fila.
-- El handler del panel corre el generador contra este texto y RECHAZA la edición si no
-- pasa (queda `{{`, más de 300 líneas, etc.): la versión anterior sigue activa
-- (PROCESOS.md § 8). Se carga por primera vez desde plantilla-agente/02-prompt.md
-- cuando H1.3 la termine; hasta entonces la tabla está vacía y el panel lo muestra así.
-- Idempotente.

create table if not exists prompt_base (
  id uuid primary key default gen_random_uuid(),
  unica boolean not null default true unique check (unica),
  texto text not null,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
drop trigger if exists trg_historial on prompt_base;
create trigger trg_historial before update on prompt_base
  for each row execute function historial_antes_de_editar();

alter table prompt_base enable row level security;
drop policy if exists prompt_base_aprobados on prompt_base;
create policy prompt_base_aprobados on prompt_base for all
  using (es_usuario_aprobado()) with check (es_usuario_aprobado());
