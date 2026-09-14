-- 0024_fragmentos_temas.sql — hito 1.15 (logica). `fragmentos.tema` solo acepta las 16
-- secciones de AGENTE.md § 8: el mismo enum que el schema de buscar_informacion y el índice
-- del prompt (los tres lugares tienen que coincidir). Las notas del dueño viven en
-- `notas_dueno` y se inyectan aparte: no son una fila de fragmentos.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fragmentos_tema_check') then
    alter table fragmentos add constraint fragmentos_tema_check
      check (tema in ('que-incluye', 'como-funciona', 'reserva-y-garantia', 'ubicacion-horarios',
        'talles', 'a-medida', 'anticipacion', 'accesorios', 'objecion-precio', 'objecion-turno',
        'objecion-competencia', 'que-no-hacemos', 'descuentos', 'novio', 'graduado', 'invitado'));
  end if;
end $$;
