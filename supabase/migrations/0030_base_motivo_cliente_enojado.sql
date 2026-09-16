-- 0030_base_motivo_cliente_enojado.sql — pedido de Mateo (16/9), agente.
-- Sin motivo garantizado para un cliente enojado: hoy solo derivaba si el mensaje además
-- calificaba como 'reclamo' (una queja puntual sobre algo, no un tono). El clasificador (paso 4b
-- del turno) lo detecta por el TONO del mensaje, no por una palabra clave — insulta, grita en
-- mayúsculas, amenaza — aunque nunca diga "reclamo" ni nombre nada roto. Sin despedida armada
-- (MOTIVOS_SIN_MENSAJE, _shared/enums.ts), igual que un reclamo: no se discute, sigue una
-- persona. Idempotente: si el motivo ya está en el check, no hace nada.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'derivaciones_motivo_check'
      and pg_get_constraintdef(oid) like '%cliente_enojado%'
  ) then
    alter table derivaciones drop constraint if exists derivaciones_motivo_check;
    alter table derivaciones add constraint derivaciones_motivo_check
      check (motivo in ('reclamo', 'cliente_enojado', 'prenda_danada', 'corporativo', 'turno_urgente_sin_hueco',
        'evento_inminente', 'descuento', 'dato_no_encontrado', 'pide_persona',
        'barandilla_doble', 'sin_respuesta', 'timeout'));
  end if;
end $$;
