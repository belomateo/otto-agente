-- 0095_devolucion_dia_cerrado.sql — revisión del trabajo 1 (9/10): la ficha «Cómo es el alquiler»
-- y el texto fijo de devolución tardía decían que, si el evento es el fin de semana, la devolución
-- es «sí o sí el lunes». El lunes 12/10 es feriado (cierres_agenda) y hay clientes con evento el
-- sábado 10: Lucía les iba a decir que lo devuelvan un día que el local no abre. «Día hábil» ya
-- excluye los feriados; ahora lo dice. prompt.md tiene la misma corrección (mismo commit).
-- Solo cambia filas que todavía tienen el texto viejo: idempotente, y no pisa una edición hecha
-- desde el panel.

update fragmentos
   set texto = replace(texto, 'si el evento es el fin de semana, sí o sí el lunes.',
                 'si el evento es el fin de semana, el lunes; si ese día el local está cerrado (un feriado), el primer día siguiente que abre.'),
       version = version + 1,
       editado_por = 'claude-code 9/10: devolución con el lunes cerrado'
 where id = 'a9f10000-0000-4000-8000-000000000201'
   and texto like '%si el evento es el fin de semana, sí o sí el lunes.%';

update contexto_agente
   set valor = replace(valor, '(si el evento es el fin de semana, el lunes)',
                 '(si el evento es el fin de semana, el lunes; si ese día el local está cerrado, el primer día siguiente que abre)'),
       version = version + 1,
       editado_por = 'claude-code 9/10: devolución con el lunes cerrado'
 where clave = 'texto_devolucion_tardia'
   and valor like '%(si el evento es el fin de semana, el lunes)%';
