-- ── Crop photos (module: Crop Management) ──────────────────────────────────
-- Crop pictures are personal farm records, so the bucket is PRIVATE: images
-- are read through short-lived signed URLs instead of a public path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crop-photos', 'crop-photos', false, 5242880,   -- 5 MB
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same folder convention as every other bucket: <bucket>/<user-id>/<file>.
drop policy if exists "Crop photos are owner only" on storage.objects;
create policy "Crop photos are owner only" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'crop-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'crop-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
