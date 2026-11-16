-- La prueba final (con el retiro) es solo de lunes a viernes, nunca un sábado (Sofía, 16/11).
-- La agenda ya no ofrece sábado (huecos.ts); acá se corrige el texto que lee Lucía.
update fragmentos
   set texto = replace(texto,
                 '—si ese día el local está cerrado (un domingo o un feriado), el último día que abre antes, por ejemplo el sábado—',
                 '—la prueba final es solo de lunes a viernes: si ese día es sábado, domingo o feriado, el último día de lunes a viernes que abre antes (evento el domingo o el lunes → el viernes)—'),
       version = version + 1,
       editado_por = 'claude-code 16/11: prueba final solo de lunes a viernes (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000000201'
   and texto like '%por ejemplo el sábado—%';
