-- Deshace 0071 y resuelve el pedido de Sofi (30/9, "el probador 3 quede solo para urgencias")
-- de otra forma. 0071 bajó las franjas a 2 probadores y el panel dejó de mostrar el probador 3:
-- la dueña lo quiere visible y usable como antes. Ahora las franjas vuelven a 3 (el equipo agenda
-- ahí a mano) y es solo Lucía la que no ofrece el probador 3.
--
-- Las seis franjas que 0071 tocó, por id (las que el historial muestra con 3 antes del 30/9).
UPDATE franjas_turnos
   SET probadores = 3
 WHERE id IN (
   '1709c5a5-44eb-4d5d-96e7-ff1e4c651a5c',
   '3571e62f-cdb3-4e58-9bde-2712ec051736',
   '284ddf8f-2837-45da-b7d6-bba2de3de98a',
   'fb0afd3f-719f-4f07-a418-569d7c11d85f',
   '6b78cede-a36d-4a54-8edb-673dc6887035',
   '96c0c5ec-6a25-4f19-901e-8a56c4bd2f43'
 )
   AND probadores = 2;

-- Hasta qué número de probador agenda Lucía sola. null = todos. Los de más arriba quedan para
-- que el equipo los use a mano (urgencias).
ALTER TABLE configuracion_agenda
  ADD COLUMN IF NOT EXISTS probadores_lucia int
    CONSTRAINT configuracion_agenda_probadores_lucia_check CHECK (probadores_lucia >= 1);

UPDATE configuracion_agenda SET probadores_lucia = 2;
