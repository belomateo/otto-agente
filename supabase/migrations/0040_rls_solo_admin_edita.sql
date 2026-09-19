-- 0040_rls_solo_admin_edita.sql — decisión de Mateo (16/9), la otra mitad de 0033.
--
-- 0007 dejó a "cualquier perfil aprobado" escribiendo todas las tablas de negocio, con un
-- comentario que difería la restricción fina a los route handlers del panel. La auditoría de
-- seguridad del 16/9 mostró por qué eso no alcanza: un empleado aprobado tiene su propio token
-- de sesión y la clave anónima (que viaja en el navegador por diseño), así que puede pegarle
-- directo a PostgREST y escribir sin pasar por el panel. El candado del route handler no lo
-- protege: es un candado en la puerta de adelante con la ventana abierta.
--
-- Mateo eligió "solo la dueña": el trabajo diario sigue siendo del equipo, y lo que define cómo
-- habla Lucía y cuánto sale cada cosa pasa a ser solo de un admin.
--
--   · Configuración del negocio → lee cualquier aprobado, escribe solo un admin.
--     El panel ya pide admin para estas entidades (entidades.ts, soloAdmin por defecto), así que
--     esto cierra el atajo por PostgREST sin cambiar lo que se puede hacer desde el panel.
--   · Trabajo diario (clientes, conversaciones, notas, derivaciones, turnos) → no se toca:
--     atender, agendar y anotar sigue siendo de cualquier aprobado.
--
-- 0033 (paneles) ya hizo lo mismo con duraciones_turno, configuracion_agenda, franjas_turnos,
-- herramientas_agente y prompt_base. Acá van las de 0007, que son mías. El storage va en 0041.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

do $$
declare
  t text;
begin
  foreach t in array array[
    'catalogo_alquiler', 'accesorios_alquiler', 'horarios', 'reglas_agente',
    'contexto_agente', 'notas_dueno', 'enlaces', 'fragmentos'
  ]
  loop
    execute format('drop policy if exists %I_aprobados on %I', t, t);
    execute format('drop policy if exists %I_lectura on %I', t, t);
    execute format('drop policy if exists %I_admin_escribe on %I', t, t);
    -- Leer: cualquier aprobado. Turnos y Bandeja (trabajo diario) necesitan ver precios,
    -- horarios y fragmentos, y GET /api/configuracion los lee para cualquier perfil.
    execute format('create policy %I_lectura on %I for select using (es_usuario_aprobado())', t, t);
    -- Escribir (insert/update/delete): solo un admin. Las dos cláusulas, using y with check:
    -- sin with check, un update podría dejar una fila que la política ya no aceptaría.
    execute format('create policy %I_admin_escribe on %I for all using (es_admin()) with check (es_admin())', t, t);
  end loop;
end $$;
