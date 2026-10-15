-- 0105_subida_de_turnos.sql — el agente de subida de turnos. Pedido de Mateo (14/10): «que todas las noches
-- a las 00:00 revise las conversaciones de Lucía y las del local y suba al panel los turnos que quedaron
-- acordados y no figuran».
--
-- La función `subida-turnos` lee las charlas del día anterior (un modelo chico lee; el código verifica y
-- escribe), y deja acá una fila por charla y corrida: qué decidió y por qué. Sirve para dos cosas: la lista de
-- revisión de la mañana (cargados, dudosos, «falta datos») y que una charla no se lea dos veces el mismo día.
--
-- Arranca en modo PRUEBA: lee y anota qué haría, pero no toca turnos ni etiquetas. Para pasar a modo real,
-- Mateo define el secreto SUBIDA_TURNOS_MODO=real en la función (o la llama con {"modo":"real"}).
--
-- Idempotente: correrla dos veces no falla ni duplica nada. La aplica Mateo a mano.

create table if not exists subida_turnos (
  id uuid primary key default gen_random_uuid(),
  -- El día de la corrida (hora de Argentina).
  corrida date not null,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  modo text not null check (modo in ('prueba', 'real')),
  accion text not null check (accion in ('cargar', 'mover', 'ya_esta', 'pasado', 'falta_datos', 'dudoso', 'sin_acuerdo', 'fallo')),
  -- El horario acordado, cuando lo hay.
  inicio timestamptz,
  motivo text,
  -- La frase de la charla en que se acordó (copia literal), para poder comprobarlo.
  frase text,
  -- El turno que se cargó o movió (solo en modo real).
  turno_id uuid references turnos(id) on delete set null,
  creado_at timestamptz not null default now(),
  unique (corrida, conversacion_id)
);

create index if not exists subida_turnos_corrida_idx on subida_turnos (corrida, accion);
create index if not exists subida_turnos_cliente_idx on subida_turnos (cliente_id);
create index if not exists subida_turnos_turno_idx on subida_turnos (turno_id) where turno_id is not null;

comment on table subida_turnos is
  'Subida de turnos (0105): una fila por charla y noche con lo que decidió el agente (cargar, mover, ya estaba, falta datos…). La escribe la función subida-turnos; en modo prueba no toca turnos.';

alter table subida_turnos enable row level security;
-- Solo la función (conexión directa) escribe; el panel puede leerla con la sesión de un aprobado.
drop policy if exists subida_turnos_lectura on subida_turnos;
create policy subida_turnos_lectura on subida_turnos for select to authenticated using (true);

-- El reloj: pg_cron corre en UTC: las 03:00 UTC son las 00:00 en Argentina, y las 04:00 las 01:00 (red de
-- contención: si la corrida se cortó por tiempo, sigue donde quedó; si ya estaba todo, termina enseguida).
select cron.schedule('subida-turnos', '0 3,4 * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/subida-turnos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url');
$cron$);
