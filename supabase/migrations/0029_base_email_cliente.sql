-- Hito 2.2 (decisión #17): el mail del cliente. La columna clientes.email existe desde 1.15 y
-- nadie la llenaba; ahora la completan el extractor y guardar_datos_cliente (agente, 2.3) y la
-- edita el equipo desde el panel (paneles, 2.4). La base se asegura de lo mínimo, lo escriba
-- quien lo escriba: forma de mail, sin espacios y en minúscula. Null está permitido (el cliente
-- no lo dio). Idempotente.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_email_formato') then
    alter table clientes add constraint clientes_email_formato
      check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
  end if;
end $$;
