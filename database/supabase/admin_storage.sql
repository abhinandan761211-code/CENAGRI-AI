-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — private storage for identity documents
-- Run AFTER database/supabase/admin.sql. Safe to re-run.
--
-- KYC documents live in a PRIVATE bucket: there is no public URL, and the
-- backend hands an authorised reviewer a signed link that expires in minutes.
-- That is the difference between "an admin can review an Aadhaar card" and
-- "anyone who guesses an object path can download it".
-- ───────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  10 * 1024 * 1024,                                     -- 10 MB per document
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- The service role already bypasses RLS; these policies make the intent
-- explicit and keep the bucket closed to everyone else. The GRANTs are needed
-- too: bypassing RLS is not the same as holding table privileges, and the
-- bucket is created with none.
grant usage on schema storage to service_role;
grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;
drop policy if exists "kyc buckets are service-role only" on storage.objects;
create policy "kyc buckets are service-role only"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'kyc-documents')
  with check (bucket_id = 'kyc-documents');

-- A user may upload their OWN document (path starts with their auth uid), so
-- the app can submit a verification request without a backend relay. They can
-- never read it back through storage: review happens via signed URLs.
drop policy if exists "users upload their own kyc document" on storage.objects;
create policy "users upload their own kyc document"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A user may clean up a document they uploaded and never listed anywhere (a
-- rejected or superseded file). Still no SELECT for them: they cannot read
-- the bucket, only replace what they own.
--   app flow: storage.from('kyc-documents')
--               .remove([`${user.id}/<file>`])
drop policy if exists "users delete their own unlisted kyc upload" on storage.objects;
create policy "users delete their own unlisted kyc upload"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Listing is not reading: this lets the admin KYC screen show which documents
-- a user uploaded (spinner/filename) without exposing a single byte. Contents
-- still come only from a backend-signed URL.
drop policy if exists "admins list kyc documents" on storage.objects;
create policy "admins list kyc documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'kyc-documents'
    and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active
        and au.role_key in ('super_admin', 'admin', 'support_manager')
    )
  );
