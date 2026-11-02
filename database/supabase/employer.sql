-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Job posting (employer side) for the worker module
-- Run AFTER schema.sql and worker.sql. Safe to re-run.
--
-- Who an "employer" is
--   Any signed-in account that owns land or a farm business — Farmer, Buyer,
--   Retailer, Warehouse … There is no separate employer account type and no
--   second user table. The only thing that makes an account an employer is
--   that it has posted a `job_listings` row, which RLS scopes to `employer_id`.
--
-- What this file adds
--   1. Two-way messaging between a worker and an employer, so a job
--      conversation is one thread both parties can read and reply to.
--   2. A notification for the employer when a worker applies.
--   3. A helper view the employer inbox reads (application + worker summary).
--
-- Everything the worker side already guarantees stays in force: money and
-- attendance remain employer/backend-written, and a worker still cannot mark
-- themselves paid or present.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Two-way messages ────────────────────────────────────────────────────
-- The existing table is worker-owned (`worker_id`), and its policy only lets
-- the WORKER read/write. An employer needs to see and answer the same thread,
-- so this adds a counterpart policy keyed on the employer's own id.
--
-- `direction` stays relative to the worker ("out" = worker → employer), which
-- is what the worker screen already renders. The employer screen flips it.

drop policy if exists "Employers read messages addressed to them" on public.worker_messages;
create policy "Employers read messages addressed to them" on public.worker_messages
  for select using (auth.uid() = counterpart_id);

drop policy if exists "Employers reply to their threads" on public.worker_messages;
create policy "Employers reply to their threads" on public.worker_messages
  for insert with check (auth.uid() = counterpart_id);

-- Replace the worker-only "manage" policy with an explicit owner policy: a
-- worker may still edit their own rows, but a broad FOR ALL policy would have
-- let a worker claim any counterpart_id. Split by command instead.
drop policy if exists "Workers manage their messages" on public.worker_messages;

drop policy if exists "Workers read their own messages" on public.worker_messages;
create policy "Workers read their own messages" on public.worker_messages
  for select using (auth.uid() = worker_id);

drop policy if exists "Workers send messages" on public.worker_messages;
create policy "Workers send messages" on public.worker_messages
  for insert with check (auth.uid() = worker_id);

drop policy if exists "Workers edit their own messages" on public.worker_messages;
create policy "Workers edit their own messages" on public.worker_messages
  for update using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

-- ── 2. Employer can read the worker profile behind an application ──────────
-- An employer must decide "who is this worker?" from the application inbox.
-- Rather than opening whole profiles, this allows reading a worker row only
-- when that worker has applied to one of the employer's jobs (or worked for
-- them). No other profile is visible.
drop policy if exists "Employers read applicants' profiles" on public.worker_profiles;
create policy "Employers read applicants' profiles" on public.worker_profiles
  for select using (
    exists (
      select 1 from public.job_applications a
        join public.job_listings j on j.id = a.job_id
       where a.worker_id = worker_profiles.user_id
         and j.employer_id = auth.uid()
    )
    or exists (
      select 1 from public.work_assignments w
       where w.worker_id = worker_profiles.user_id
         and w.employer_id = auth.uid()
    )
  );

-- The same idea for skills: only for workers who applied to you.
drop policy if exists "Employers read applicants' skills" on public.worker_skills;
create policy "Employers read applicants' skills" on public.worker_skills
  for select using (
    exists (
      select 1 from public.job_applications a
        join public.job_listings j on j.id = a.job_id
       where a.worker_id = worker_skills.worker_id
         and j.employer_id = auth.uid()
    )
  );

-- ── 3. Employer notifications ──────────────────────────────────────────────
-- The worker side already writes to `worker_notifications`. An employer needs
-- the mirror of that, so a very small table keyed by the employer's auth id.
create table if not exists public.employer_notifications (
  id         uuid primary key default gen_random_uuid(),
  employer_id uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'application'
               check (kind in ('application', 'message', 'work', 'system')),
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists employer_notifications_idx
  on public.employer_notifications (employer_id, read_at, created_at desc);

alter table public.employer_notifications enable row level security;

drop policy if exists "Employers manage their notifications" on public.employer_notifications;
create policy "Employers manage their notifications" on public.employer_notifications
  for all using (auth.uid() = employer_id) with check (auth.uid() = employer_id);

-- ── 4. Notify the employer when someone applies ────────────────────────────
-- Replaces the worker-only alert from worker.sql so BOTH sides are told about
-- the same event in one transaction.
create or replace function public.worker_new_application_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_title text;
  employer  uuid;
  worker_name text;
begin
  select title, employer_id into job_title, employer
    from public.job_listings where id = new.job_id;

  select coalesce(full_name, 'A worker') into worker_name
    from public.worker_profiles where user_id = new.worker_id;

  insert into public.worker_notifications (worker_id, kind, title, body, link)
  values (
    new.worker_id, 'application', 'Application sent',
    'Your application for "' || coalesce(job_title, 'a job') || '" is with the employer.',
    '/worker/applications'
  );

  if employer is not null then
    insert into public.employer_notifications (employer_id, kind, title, body, link)
    values (
      employer, 'application', 'New application received',
      coalesce(worker_name, 'A worker') || ' applied for "' || coalesce(job_title, 'your job') || '".',
      '/employer/applicants'
    );
  end if;

  return new;
end;
$$;

-- ── 5. Employer inbox view ─────────────────────────────────────────────────
-- One row per application with the worker summary the inbox shows. Defined with
-- `security_invoker` so RLS on the underlying tables still applies to whoever
-- queries it — the view never widens access on its own.
create or replace view public.employer_applicant_view
with (security_invoker = true)
as
select
  a.id              as application_id,
  a.job_id          as job_id,
  a.worker_id       as worker_id,
  a.status          as status,
  a.message         as message,
  a.employer_note   as employer_note,
  a.created_at      as created_at,
  a.decided_at      as decided_at,
  j.employer_id     as employer_id,
  j.title           as job_title,
  j.category        as job_category,
  j.wage_inr        as wage_inr,
  j.pay_type        as pay_type,
  j.work_type       as work_type,
  j.start_date      as start_date,
  j.end_date        as end_date,
  j.village         as job_village,
  j.district        as job_district,
  j.workers_needed  as workers_needed,
  j.workers_hired   as workers_hired,
  j.status          as job_status,
  wp.full_name      as worker_name,
  wp.phone          as worker_phone,
  wp.village        as worker_village,
  wp.district       as worker_district,
  wp.experience_years as worker_experience,
  wp.expected_wage  as worker_expected_wage,
  wp.rating_avg     as worker_rating,
  wp.rating_count   as worker_rating_count,
  wp.completed_jobs as worker_completed_jobs,
  wp.identity_status as worker_identity_status,
  wp.phone_verified as worker_phone_verified
from public.job_applications a
join public.job_listings j on j.id = a.job_id
left join public.worker_profiles wp on wp.user_id = a.worker_id;

grant select on public.employer_applicant_view to authenticated;

-- ── 6. Employer dashboard roll-up ──────────────────────────────────────────
-- Counts the employer's own listings and applications. Security invoker keeps
-- it scoped exactly like the tables it reads.
create or replace view public.employer_job_stats
with (security_invoker = true)
as
select
  j.id as job_id,
  j.employer_id,
  j.title,
  j.category,
  j.status,
  j.workers_needed,
  j.workers_hired,
  j.wage_inr,
  j.pay_type,
  j.work_type,
  j.district,
  j.village,
  j.start_date,
  j.end_date,
  j.created_at,
  count(a.id) filter (where a.status in ('applied', 'under_review')) as pending_applications,
  count(a.id) filter (where a.status = 'accepted') as accepted_applications,
  count(a.id) as total_applications
from public.job_listings j
left join public.job_applications a on a.job_id = j.id
group by j.id;

grant select on public.employer_job_stats to authenticated;

-- ── 7. Close a job when every seat is filled ───────────────────────────────
-- worker.sql already flips status to 'filled' from the accept trigger; this
-- keeps `workers_hired` honest if an assignment is cancelled later.
create or replace function public.employer_recount_hired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  hired int;
  needed int;
begin
  target := coalesce(new.job_id, old.job_id);
  select count(*)::int into hired
    from public.work_assignments
   where job_id = target and status <> 'cancelled';
  select workers_needed into needed from public.job_listings where id = target;

  update public.job_listings
     set workers_hired = hired,
         status = case
                    when status in ('closed', 'cancelled', 'draft') then status
                    when needed is not null and hired >= needed then 'filled'
                    else 'open'
                  end
   where id = target;

  return null;
end;
$$;

drop trigger if exists trg_employer_recount_hired on public.work_assignments;
create trigger trg_employer_recount_hired
  after insert or update of status or delete on public.work_assignments
  for each row execute function public.employer_recount_hired();
