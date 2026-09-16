-- 0042_base_mensajes_no_enviado.sql — hallazgo de la auditoría del 16/9 (cañería, MEDIO).
--
-- Cuando una persona del local responde desde el panel, mostrador_enviar (0028) ya rechaza con
-- 409 si pasaron más de 24 hs desde el último mensaje del cliente. Pero entre que la persona
-- aprieta enviar y el worker toma el trabajo pasan segundos, y la ventana puede cerrarse en el
-- medio: ahí el worker descubre que ya no puede mandar texto libre, deja el motivo en
-- eventos_agente y corta. El mensaje queda en `mensajes` con wa_message_id en null — o sea,
-- idéntico a uno que todavía no salió. En el panel se ve como enviado y la persona cree que el
-- cliente lo recibió.
--
-- En el camino de Lucía esto no pasa: ahí las burbujas sin enviar se borran, porque las puede
-- volver a generar. Lo que escribió una persona no se borra: se marca.
--
-- `no_enviado_motivo`: null = normal (salió, o todavía no le tocó). Con valor = no salió y no va
-- a salir, y el texto dice por qué. El panel lo muestra en la burbuja para que la persona sepa
-- que tiene que escribirle al cliente por otro lado.

alter table mensajes add column if not exists no_enviado_motivo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_no_enviado_motivo_check') then
    alter table mensajes add constraint mensajes_no_enviado_motivo_check
      check (no_enviado_motivo is null or no_enviado_motivo in ('ventana_cerrada', 'error_al_enviar'));
  end if;
end $$;

comment on column mensajes.no_enviado_motivo is
  'Null = salió o todavía no salió. Con valor, no salió y no va a salir: ventana_cerrada (pasaron las 24 hs de WhatsApp) o error_al_enviar (Meta falló y se agotaron los intentos). Solo para lo que escribe una persona desde el panel: lo de Lucía se borra y se rehace.';

-- Índice parcial: el panel pregunta "¿esta charla tiene algo que no salió?" y son poquísimas filas.
create index if not exists mensajes_no_enviado_idx on mensajes (conversacion_id)
  where no_enviado_motivo is not null;
