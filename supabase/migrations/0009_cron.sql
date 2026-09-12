-- 0009_cron.sql — deja pg_cron y pg_net habilitados para Fase 1.
--
-- Los jobs reales (recordatorio 24 hs, confirmación, post-evento, recontacto,
-- analista nocturno, limpieza de cola — STACK.md § 2 y PROCESOS.md § 2) son
-- H1.14 de TRABAJO.md § 2, Fase 1, no Fase 0: necesitan que las Edge Functions
-- ya estén desplegadas para tener una URL a la que llamar con `cron.schedule` +
-- `net.http_post`. Programarlos ahora contra funciones que no existen todavía
-- fallaría en silencio y ensuciaría el estado de pg_cron. Cuando `logica` haga
-- H1.14, agrega los `cron.schedule(...)` en una migración nueva (0011 en adelante).
--
-- Nota de diseño ya tomada (STACK.md § 8): el worker NO usa un poll de pg_cron
-- cada 10 s (pg_cron no baja de 1 minuto de resolución). En cambio, H1.11 dispara
-- el worker al encolar (trigger AFTER INSERT en cola_trabajos → net.http_post) y
-- un cron cada 1 minuto queda como red de contención por si ese llamado falla.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
