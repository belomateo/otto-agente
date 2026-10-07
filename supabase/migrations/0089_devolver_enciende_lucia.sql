-- Bug: atencion_resolver('devolver') cambiaba estado a 'activa' pero no tocaba lucia_activa.
-- Lucía quedaba apagada aunque el equipo la hubiera "devuelto". Mismo criterio que 0081
-- (trigger en la base, no en el código, porque a 'activa' se llega por más de un camino):
-- si el estado pasa de 'derivada' a 'activa', lucia_activa vuelve a true.
create or replace function apagar_lucia_al_derivar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'derivada' and old.estado is distinct from 'derivada' then
    new.lucia_activa := false;
  end if;
  -- Espejo: devolver a Lucía la enciende.
  if new.estado = 'activa' and old.estado = 'derivada' then
    new.lucia_activa := true;
  end if;
  return new;
end;
$$;

-- Las charlas que hoy están activas con lucia_activa = false son residuo del bug:
-- alguien les dio "Devolver a Lucía" pero Lucía siguió muda. Corregirlas.
update conversaciones set lucia_activa = true
 where estado = 'activa' and not lucia_activa;
