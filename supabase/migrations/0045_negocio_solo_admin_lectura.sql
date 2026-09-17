-- 0045_negocio_solo_admin_lectura.sql — decisión de Mateo (16/9, tanda de permisos): el equipo
-- ve SOLO las conversaciones y lo que necesita para atenderlas; todo lo demás es de la dueña,
-- INCLUIDA LA LECTURA. 0033 (y las de logica en el mismo día) ya habían cerrado la escritura de
-- Catálogo, Conocimiento y Configuración a es_admin(); esto cierra también la lectura.
--
-- No entran acá horarios, franjas_turnos, duraciones_turno ni configuracion_agenda: Turnos
-- (que el equipo SÍ conserva, para marcar retiró/devolvió en el mostrador) necesita leerlas
-- para armar la grilla del día. Tampoco clientes ni turnos (el equipo los conserva) ni
-- eventos_agente/consumo_llm/metricas_diarias (Bitácora, las hace logica en su propia migración).
--
-- Idempotente.

do $$
declare
  t text;
begin
  foreach t in array array[
    'catalogo_alquiler', 'accesorios_alquiler', 'fragmentos',
    'herramientas_agente', 'contexto_agente', 'reglas_agente', 'enlaces', 'notas_dueno', 'prompt_base'
  ]
  loop
    execute format('drop policy if exists %I_lectura on %I', t, t);
    execute format('create policy %I_lectura on %I for select using (es_admin())', t, t);
  end loop;
end $$;
