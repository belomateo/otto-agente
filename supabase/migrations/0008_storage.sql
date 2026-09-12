-- 0008_storage.sql — bucket `catalogo` (fotos del catálogo, lectura pública para que
-- Lucía pueda mandar links por WhatsApp) y `adjuntos` (privado: fotos que suba el dueño
-- desde el panel, comprobantes, etc.).

insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

create policy catalogo_lectura_publica on storage.objects for select
  using (bucket_id = 'catalogo');

create policy catalogo_escritura_aprobados on storage.objects for insert
  with check (bucket_id = 'catalogo' and es_usuario_aprobado());

create policy catalogo_borrado_aprobados on storage.objects for delete
  using (bucket_id = 'catalogo' and es_usuario_aprobado());

create policy adjuntos_lectura_aprobados on storage.objects for select
  using (bucket_id = 'adjuntos' and es_usuario_aprobado());

create policy adjuntos_escritura_aprobados on storage.objects for insert
  with check (bucket_id = 'adjuntos' and es_usuario_aprobado());

create policy adjuntos_borrado_aprobados on storage.objects for delete
  using (bucket_id = 'adjuntos' and es_usuario_aprobado());
