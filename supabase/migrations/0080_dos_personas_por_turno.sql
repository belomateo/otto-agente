-- Dos personas por turno (Mateo, 2/10): en un turno normal pueden probarse dos, y quien ya
-- tiene turno puede sumar a otra persona sin sacar otro. Caso real: un cliente pidió sumar a
-- un amigo al mismo turno y Lucía derivó porque no lo encontraba en la base.
-- "diez minutos" en letras: con "10 minutos", precio_sin_herramienta leía el 10 como un precio
-- cada vez que Lucía citaba la tolerancia (rehacer → barandilla_doble → derivación).
UPDATE fragmentos SET texto = 'Te esperamos en España 764, Rosario. En cada turno pueden venir dos personas a probarse, y cada una puede traer un acompañante. Si ya tenés turno y querés sumar a otra persona, viene en ese mismo turno: no hace falta sacar otro. Hay diez minutos de tolerancia. Si alquilás, para reservar el traje se abona el 100% en el local. Si no podés venir, avisanos y lo reprogramamos.',
 editado_por = 'Mateo 2/10: dos personas por turno', editado_at = now()
 WHERE id = 'a9f10000-0000-4000-8000-000000000202';
