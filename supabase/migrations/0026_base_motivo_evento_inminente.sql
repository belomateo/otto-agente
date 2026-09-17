-- 0026_base_motivo_evento_inminente.sql — decisión #8 de Mateo (14/9), logica.
-- Un alquiler con el evento hoy o mañana lo resuelve una persona: se deriva siempre, con un
-- motivo propio para que Atención humana lo distinga de 'turno_urgente_sin_hueco' (un evento
-- más lejano que no encontró lugar en la agenda). Lo decide código, no el LLM (AGENTE.md § 2).
-- Idempotente: si el motivo ya está en el check, no hace nada.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'derivaciones_motivo_check'
      and pg_get_constraintdef(oid) like '%evento_inminente%'
  ) then
    alter table derivaciones drop constraint if exists derivaciones_motivo_check;
    alter table derivaciones add constraint derivaciones_motivo_check
      check (motivo in ('reclamo', 'prenda_danada', 'corporativo', 'turno_urgente_sin_hueco',
        'evento_inminente', 'descuento', 'dato_no_encontrado', 'pide_persona',
        'barandilla_doble', 'sin_respuesta', 'timeout'));
  end if;
end $$;
