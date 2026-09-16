-- 0023_base_ficha_y_motivos.sql — hito 1.15 (logica). La ficha del cliente de AGENTE.md § 7
-- como columnas de `clientes`, y el enum de motivos de derivación de PROCESOS.md § 4.
-- Idempotente: correrla dos veces no falla ni duplica nada.

alter table clientes
  add column if not exists evento text,
  add column if not exists fecha_evento date,
  add column if not exists rol text,
  add column if not exists dia_o_noche text,
  add column if not exists talle_aprox text,
  add column if not exists ciudad text,
  add column if not exists color_preferido text,
  add column if not exists presupuesto_mencionado text,
  add column if not exists notas_libres text,
  add column if not exists version int not null default 1,
  add column if not exists editado_por text,
  add column if not exists editado_at timestamptz not null default now();

-- Postgres no tiene `add constraint if not exists`: se chequea pg_constraint antes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_evento_check') then
    alter table clientes add constraint clientes_evento_check
      check (evento in ('casamiento', 'graduacion', 'fiesta', 'laboral', 'otro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_rol_check') then
    alter table clientes add constraint clientes_rol_check
      check (rol in ('novio', 'invitado', 'graduado', 'padre', 'otro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_dia_o_noche_check') then
    alter table clientes add constraint clientes_dia_o_noche_check
      check (dia_o_noche in ('dia', 'noche'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'derivaciones_motivo_check') then
    alter table derivaciones add constraint derivaciones_motivo_check
      check (motivo in ('reclamo', 'prenda_danada', 'corporativo', 'turno_urgente_sin_hueco',
        'descuento', 'dato_no_encontrado', 'pide_persona', 'barandilla_doble', 'sin_respuesta',
        'timeout'));
  end if;
end $$;

-- El dueño edita la ficha desde Clientes (PROCESOS.md § 5), así que lleva el mismo historial
-- que las demás tablas editables. El extractor de Lucía también la escribe después de cada
-- turno (con editado_por = 'lucia'): cada cambio de ficha deja su fila de historial.
drop trigger if exists trg_historial on clientes;
create trigger trg_historial before update on clientes
  for each row execute function historial_antes_de_editar();
