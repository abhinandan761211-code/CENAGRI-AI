-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — file storage (product photos, avatars, listings, videos)
--
-- Run AFTER schema.sql. Safe to re-run.
--
-- Files do NOT belong in Postgres tables. The database keeps only the public
-- URL (`retailer_products.image_url`, `profiles.avatar_url` …); the bytes live
-- in a Supabase Storage bucket. This file creates those buckets and the access
-- rules that keep them safe.
--
--   product-images  public read · owner write · 5 MB · images only
--   avatars         public read · owner write · 2 MB · images only
--   listing-images  public read · owner write · 5 MB · images only
--   kisan-videos    public read · owner write · 200 MB · video only
--
-- "Owner write" means: a user may only write inside a folder named after their
-- own user id, e.g. product-images/<their-uid>/dap-bag.webp. Nobody can
-- overwrite or delete another shop's photos.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Buckets ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,   -- 5 MB
   array['image/jpeg','image/png','image/webp','image/gif']),
  ('avatars',        'avatars',        true, 2097152,   -- 2 MB
   array['image/jpeg','image/png','image/webp']),
  ('listing-images', 'listing-images', true, 5242880,   -- 5 MB
   array['image/jpeg','image/png','image/webp','image/gif']),
  ('kisan-videos',   'kisan-videos',   true, 209715200, -- 200 MB
   array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Anyone can read these files (they are product photos) ---------------
drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images" on storage.objects
  for select using (bucket_id in ('product-images','avatars','listing-images','kisan-videos'));

-- 3. A signed-in user may upload only inside their own folder ------------
--    Path convention: <bucket>/<user-id>/<file-name>
drop policy if exists "Users upload into their own folder" on storage.objects;
create policy "Users upload into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('product-images','avatars','listing-images','kisan-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 4. …and may replace or delete only their own files ---------------------
drop policy if exists "Users update their own files" on storage.objects;
create policy "Users update their own files" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('product-images','avatars','listing-images','kisan-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete their own files" on storage.objects;
create policy "Users delete their own files" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('product-images','avatars','listing-images','kisan-videos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 5. Check ------------------------------------------------------------------
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('product-images','avatars','listing-images','kisan-videos');
