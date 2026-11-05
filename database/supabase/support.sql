-- ───────────────────────────────────────────────────────────────────────────
-- User-facing support & account requests
--
-- The farmer's Help and Account Management screens used to keep their writes in
-- `localStorage`: a support ticket existed only in one browser and never reached
-- the admin Support inbox, and a deletion request was never seen by anybody. The
-- tables already existed (`support_tickets`, `admin_deletion_requests`) but
-- admin.sql deliberately grants `authenticated` nothing on them, so the app had
-- nowhere to write.
--
-- This file opens exactly two narrow doors and nothing else:
--
--   • a user may INSERT support tickets that belong to them, and READ their own;
--   • a user may INSERT a deletion request for their own account, and READ it.
--
-- No UPDATE or DELETE for users on either table: closing a ticket and deciding a
-- deletion are admin actions and stay behind the service role. `with check` is
-- spelled out so a forged `user_id` cannot file a ticket as somebody else.
--
-- Run after schema.sql and admin.sql.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Support tickets ────────────────────────────────────────────────────────

alter table public.support_tickets enable row level security;

-- Removing the blanket revoke from admin.sql for these two tables only.
grant select, insert on public.support_tickets to authenticated;

drop policy if exists "Users create their own support tickets" on public.support_tickets;
create policy "Users create their own support tickets"
  on public.support_tickets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own support tickets" on public.support_tickets;
create policy "Users read their own support tickets"
  on public.support_tickets for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- support_messages stays service-role only: the reply thread is written by the
-- admin side, and a user reading internal notes would be a data leak.

-- 2. Deletion requests ──────────────────────────────────────────────────────

alter table public.admin_deletion_requests enable row level security;

grant select, insert on public.admin_deletion_requests to authenticated;

drop policy if exists "Users request deletion of their own account" on public.admin_deletion_requests;
create policy "Users request deletion of their own account"
  on public.admin_deletion_requests for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read their own deletion requests" on public.admin_deletion_requests;
create policy "Users read their own deletion requests"
  on public.admin_deletion_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Only one open request per account: a double tap must not queue two deletions
-- that an admin then has to reconcile.
create unique index if not exists one_pending_deletion_per_user
  on public.admin_deletion_requests (user_id)
  where status = 'pending';

-- 3. Notification preferences ───────────────────────────────────────────────
-- Stored as one JSON key on the profile (`details.notifications`) rather than a
-- new table: it is read in the same query as the rest of the profile and never
-- queried across users. Nothing to do here beyond the `details` column that
-- schema.sql already defines.

comment on table public.support_tickets is
  'One row per support request. Users insert/read their own; admins triage via the service role.';
comment on table public.admin_deletion_requests is
  'Account deletion workflow. A user may open one pending request; an admin decides.';
