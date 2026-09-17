-- 0046_negocio_turnos_urgencia.sql — etiqueta de urgencia (decisión de Mateo, 16/9): al cliente
-- con el evento más cercano se le ofrece el turno más próximo de la agenda y ese turno queda
-- marcado como "turno de urgencia" (a los eventos más lejanos se les ofrece recién a partir del
-- cuarto día, dias_reserva_urgencia — eso ya lo hizo logica). La marca la pone logica desde el
-- cálculo de huecos; acá solo se abre la columna, en la tabla de turnos (mi territorio).
-- Idempotente.

alter table turnos add column if not exists urgencia boolean not null default false;

-- turnos_por_avisar (0031) es `select t.*`, pero Postgres congela la lista de columnas al
-- crear la vista: hay que recrearla para que urgencia aparezca en el cartel de turno.
create or replace view turnos_por_avisar with (security_invoker = true) as
select t.*
from turnos t
join configuracion_agenda c on c.aviso_turno_min is not null
where t.aviso_ok_at is null
  and t.estado not in ('cancelado', 'no-vino')
  and t.inicio - make_interval(mins => c.aviso_turno_min) <= now()
  and now() < t.fin;
