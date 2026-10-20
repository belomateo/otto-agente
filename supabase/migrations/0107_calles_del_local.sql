-- 0107_calles_del_local.sql — las calles de referencia del local (las dijo el equipo en el chat del 17/10: «Estamos en
-- España entre Santa Fe y Córdoba»). Una clienta preguntó por la esquina y Lucía no tenía el dato: pasó la charla.
-- Idempotente: se aplica solo si la ficha todavía no lo dice, y no pisa una edición hecha desde el panel.

update fragmentos
   set texto = texto || ' El local queda en España entre Santa Fe y Córdoba.',
       version = version + 1,
       editado_por = 'claude-code 20/10: calles de referencia del local (dicho por el equipo el 17/10)'
 where id = 'a9f10000-0000-4000-8000-000000000401'
   and texto not like '%España entre Santa Fe y Córdoba%';
