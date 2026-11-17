-- 0123_evento_esta_semana_al_local.sql — 17/11 (Sofía): evento esta semana y sin turno libre antes → Lucía le dice que
-- se acerque cuanto antes al local, por orden de llegada, sin asegurar disponibilidad. Ya no se deriva al equipo
-- (herramientas/derivacion.ts, avisoEventoCercano). {horario} lo completa el código con el horario de la agenda.
update contexto_agente
   set valor = 'Como tu evento es en estos días y la agenda de turnos antes de esa fecha ya está completa, te recomiendo que te acerques cuanto antes al local, en España 764. El horario es: {horario} Te atienden por orden de llegada, aunque los turnos ya agendados tienen prioridad. El equipo va a hacer todo lo posible para conseguirte alguna alternativa, aunque sin poder asegurarte la disponibilidad: depende del talle de cada persona y solo se puede ver personalmente en el local.'
 where clave = 'texto_evento_inminente';

-- El fragmento del local decía que con el evento hoy o mañana se pasa el teléfono: ya no.
update fragmentos
   set texto = replace(texto, '; solo si el evento es hoy o mañana se pasa el teléfono del local, para resolverlo directo', ''),
       version = version + 1,
       editado_por = 'claude-code 17/11: evento esta semana → al local por orden de llegada (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000000401'
   and texto like '%solo si el evento es hoy o mañana se pasa el teléfono del local, para resolverlo directo%';
