-- 0094_herramientas_unificadas_y_texto_demora.sql — pedido de Mateo (9/10). Acompaña al código del
-- mismo día; se aplica cuando ese código se publica.
--
-- 1. Herramientas: de 14 a 8 (herramientas/index.ts). consultar_accesorios entró en
--    consultar_catalogo (accesorios=true); confirmar_turno, reprogramar_turno y cancelar_turno, en
--    cambiar_turno; anotar, en guardar_datos_cliente (nota); ver_turnos_cliente y enviar_fotos se
--    fueron. herramientas_agente es lo que el panel muestra y lo que se puede apagar: quedan las 8,
--    en el orden del código. La descripción vacía significa "la del código" (0083).
-- 2. texto_demora: lo que sale si Lucía no logra contestar ni con el último intento (turno.ts).
--    Editable desde el panel; si la fila no está, el código usa el mismo texto de respaldo.
--
-- Idempotente.

delete from herramientas_agente
 where nombre in ('consultar_accesorios', 'ver_turnos_cliente', 'reprogramar_turno', 'cancelar_turno',
                  'confirmar_turno', 'anotar', 'enviar_fotos');

insert into herramientas_agente (nombre, tipo, descripcion, activa, orden, editado_por)
values ('cambiar_turno', 'accion', '', true, 5, 'claude-code 9/10: herramientas unificadas')
on conflict (nombre) do nothing;

update herramientas_agente h
   set orden = o.n,
       editado_por = 'claude-code 9/10: herramientas unificadas'
  from (values ('buscar_informacion', 1), ('consultar_catalogo', 2), ('buscar_horarios', 3), ('agendar_turno', 4),
               ('cambiar_turno', 5), ('guardar_datos_cliente', 6), ('enviar_link', 7), ('derivar_a_persona', 8)) as o(nombre, n)
 where h.nombre = o.nombre
   and h.orden is distinct from o.n;

insert into contexto_agente (clave, valor, editado_por)
values ('texto_demora', 'Perdón la demora, se me complicó revisar eso justo ahora. ¿Me lo escribís de nuevo en un ratito?',
        'claude-code 9/10: Lucía nunca muda')
on conflict (clave) do nothing;
