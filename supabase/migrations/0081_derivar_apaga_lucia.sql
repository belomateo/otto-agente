-- Pedido de Mateo (3/10): una vez que la charla se deriva, Lucía no contesta más hasta que alguien
-- la active desde el panel (botón "Activar Lucía", 0070). Revierte el pedido del 21/9 (Lucía
-- seguía contestando con la charla derivada): en la semana del 29/9 al 3/10, en 43 de 52
-- derivaciones Lucía siguió escribiendo (172 mensajes) y en 24 volvió a mandar un "te paso con
-- el equipo" (40 veces), pisando al equipo que ya estaba atendiendo.
--
-- Va en la base y no en el worker porque a 'derivada' se llega por varios caminos (la
-- herramienta, el fallo técnico de la cola, reabrir desde el panel): el trigger los cubre a todos.
create or replace function apagar_lucia_al_derivar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'derivada' and old.estado is distinct from 'derivada' then
    new.lucia_activa := false;
  end if;
  return new;
end;
$$;

drop trigger if exists derivar_apaga_lucia on conversaciones;
create trigger derivar_apaga_lucia
  before update of estado on conversaciones
  for each row execute function apagar_lucia_al_derivar();

-- Las charlas que ya están derivadas siguen la misma regla.
update conversaciones set lucia_activa = false where estado = 'derivada' and lucia_activa;

-- La reserva de urgencia vuelve a los 3 días que fijó Mateo el 16/9. El 7 que había era residuo
-- de los arneses del panel (historial_ediciones: 10, null, 300… y el 22/9 se "corrigió" al valor
-- del seed, 7, en vez de al de Mateo).
update configuracion_agenda set dias_reserva_urgencia = 3,
  editado_por = 'Mateo 16/9 (restaurado el 3/10): reserva de urgencia a 3 días'
 where dias_reserva_urgencia is distinct from 3;
