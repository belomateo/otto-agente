-- 0002_cola.sql — cola de trabajos del worker, con FOR UPDATE SKIP LOCKED
-- para que dos workers nunca tomen el mismo trabajo (control de Fase 0).

create table cola_trabajos (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'hecho', 'error')),
  intentos int not null default 0,
  tomado_por text,
  tomado_at timestamptz,
  creado_at timestamptz not null default now(),
  procesado_at timestamptz
);
create index cola_trabajos_estado_idx on cola_trabajos(estado);

-- Toma UN trabajo pendiente de forma atómica y lo marca 'procesando'.
-- SKIP LOCKED: si otro worker ya lo tiene bloqueado, esta llamada lo salta
-- en vez de esperar o repetirlo. Es la pieza que garantiza el control de Fase 0.
create or replace function cola_tomar_uno(p_worker text)
returns cola_trabajos
language plpgsql
as $$
declare
  v_fila cola_trabajos;
begin
  select * into v_fila
  from cola_trabajos
  where estado = 'pendiente'
  order by creado_at
  for update skip locked
  limit 1;

  if v_fila.id is not null then
    update cola_trabajos
    set estado = 'procesando', tomado_por = p_worker, tomado_at = now()
    where id = v_fila.id
    returning * into v_fila;
  end if;

  return v_fila;
end;
$$;
