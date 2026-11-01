
-- ───────────────────────────────────────────────────────────────────────────
-- Creator media buckets (module: Kisan Video Hub)
--
--   kisan-video-files  public read · owner write · 500 MB · mp4/webm/mov
--   video-thumbnails   public read · owner write ·   5 MB · images
--   channel-banners    public read · owner write ·   5 MB · images
--
-- Re-runnable: buckets are upserted and policies dropped before re-creation.
-- ───────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kisan-video-files', 'kisan-video-files', true, 524288000,   -- 500 MB
   array['video/mp4','video/webm','video/quicktime']),
  ('video-thumbnails',  'video-thumbnails',  true, 5242880,     -- 5 MB
   array['image/jpeg','image/png','image/webp']),
  ('channel-banners',   'channel-banners',   true, 5242880,     -- 5 MB
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Creator media is public" on storage.objects;
create policy "Creator media is public" on storage.objects
  for select using (bucket_id in ('kisan-video-files','video-thumbnails','channel-banners'));

-- Same folder convention as the product images: <bucket>/<user-id>/<file>.
drop policy if exists "Creators upload their own media" on storage.objects;
create policy "Creators upload their own media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('kisan-video-files','video-thumbnails','channel-banners')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Creators update their own media" on storage.objects;
create policy "Creators update their own media" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('kisan-video-files','video-thumbnails','channel-banners')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Creators delete their own media" on storage.objects;
create policy "Creators delete their own media" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('kisan-video-files','video-thumbnails','channel-banners')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

select id, public, file_size_limit from storage.buckets
where id in ('kisan-video-files','video-thumbnails','channel-banners');
