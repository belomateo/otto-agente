-- 0006_metricas.sql — costo de LLM por turno de conversación y métricas diarias.
-- "turno" acá es un turno de charla (un llamado al LLM), no un turno de Otto
-- (la tabla `turnos` de 0004): se linkea a `conversaciones`, no a `turnos`.

create table consumo_llm (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid references conversaciones(id) on delete set null,
  modelo text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  costo_usd numeric(10, 4) not null default 0,
  creado_at timestamptz not null default now()
);
create index consumo_llm_conversacion_id_idx on consumo_llm(conversacion_id);
create index consumo_llm_creado_at_idx on consumo_llm(creado_at);

create table metricas_diarias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  turnos_agendados int not null default 0,
  conversaciones_nuevas int not null default 0,
  derivaciones int not null default 0,
  costo_llm_usd numeric(10, 4) not null default 0,
  creado_at timestamptz not null default now()
);
