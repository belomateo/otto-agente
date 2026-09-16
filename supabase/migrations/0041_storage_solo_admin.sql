-- 0041_storage_solo_admin.sql — decisión de Mateo (16/9), la parte de archivos de 0040.
--
-- El bucket `catalogo` es de LECTURA PÚBLICA (Lucía manda los links por WhatsApp, así que
-- cualquiera con el link ve la foto: es a propósito). 0008 y 0025 dejaron subir, reemplazar y
-- borrar a cualquier perfil aprobado, mientras que la ruta del panel (catalogo/fotos) ya pedía
-- admin. La auditoría del 16/9 mostró el atajo: un empleado aprobado puede llamar al storage
-- directo con su sesión y subir o borrar lo que quiera de un bucket que ve todo internet.
--
-- Acá: el catálogo lo maneja solo un admin, igual que sus precios (0040).
--
-- `adjuntos` NO se toca: es privado, no se puede leer sin estar aprobado, y es donde se guarda
-- lo que el equipo suba en el trabajo diario. Restringirlo a admin rompería ese camino sin
-- ganar nada.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

drop policy if exists catalogo_escritura_aprobados on storage.objects;
drop policy if exists catalogo_borrado_aprobados on storage.objects;
drop policy if exists catalogo_update_aprobados on storage.objects;
drop policy if exists catalogo_escritura_admin on storage.objects;
drop policy if exists catalogo_borrado_admin on storage.objects;
drop policy if exists catalogo_update_admin on storage.objects;

create policy catalogo_escritura_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogo' and es_admin());

create policy catalogo_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'catalogo' and es_admin())
  with check (bucket_id = 'catalogo' and es_admin());

create policy catalogo_borrado_admin on storage.objects for delete to authenticated
  using (bucket_id = 'catalogo' and es_admin());
