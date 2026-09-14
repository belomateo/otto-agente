-- 0025_storage_update.sql — hito 1.15 (logica). 0008 dejó lectura, alta y borrado en los
-- buckets, pero no UPDATE: reemplazar una foto por la misma ruta (upsert) daba 403. Lo pidió
-- paneles para H1.9 (informe del verificador § 5).
drop policy if exists catalogo_update_aprobados on storage.objects;
create policy catalogo_update_aprobados on storage.objects for update to authenticated
  using (bucket_id = 'catalogo' and es_usuario_aprobado())
  with check (bucket_id = 'catalogo' and es_usuario_aprobado());

drop policy if exists adjuntos_update_aprobados on storage.objects;
create policy adjuntos_update_aprobados on storage.objects for update to authenticated
  using (bucket_id = 'adjuntos' and es_usuario_aprobado())
  with check (bucket_id = 'adjuntos' and es_usuario_aprobado());
