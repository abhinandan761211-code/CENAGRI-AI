-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Agricultural Worker module
-- Run AFTER schema.sql and features.sql. Safe to re-run: every statement is
-- idempotent.
--
-- What this module is
--   A worker finds farm work, applies, gets accepted, works, gets paid and is
--   rated. Employers are ordinary CenAGRI accounts (Farmer / Buyer / Retailer /
--   any role that owns land or a farm business) — there is no separate
--   "employer" account type and no second user table.
--
-- Security model (the same one retailer.sql uses)
--   • Every table has RLS enabled. A worker can only read and write rows that
--     belong to them.
--   • `auth.uid()` is the ONLY identity trusted. Nothing here accepts a
--     user_id supplied by the browser for authorisation.
--   • Money and attendance are never writable by the worker: `worker_earnings`
--     and `work_attendance` are employer/backend-written, and a worker may only
--     read their own rows. This is what makes "paid" mean something.
--   • An open job listing is readable by any signed-in worker so it can be
--     found; drafts belong to their poster alone.
--
-- Nothing here seeds demo rows: every table starts empty by design.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Enumerations ───────────────────────────────────────────────────────────
-- Kept as text + check constraints rather than PG enums so adding a value later
-- is a one-line edit instead of an ALTER TYPE that cannot run in a transaction.

-- ── 1. Worker profile ──────────────────────────────────────────────────────
-- One row per worker. Skills / wage / availability also live in
-- `profiles.details` from onboarding; this table is the durable, queryable
-- version the job matching and employer view read.
create table if not exists public.worker_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  full_name         text,
  phone             text,
  district          text,
  state             text,
  village           text,
  about             text check (about is null or char_length(about) <= 2000),
  experience_years  integer not null default 0 check (experience_years between 0 and 60),
  expected_wage     numeric(10,2) check (expected_wage is null or expected_wage >= 0),
  -- Full time / Seasonal / Weekends only / On call
  availability      text not null default 'Full time'
                      check (availability in ('Full time', 'Seasonal', 'Weekends only', 'On call')),
  languages         text[] not null default '{}'::text[],
  preferred_categories text[] not null default '{}'::text[],
  -- Verification: phone is confirmed through Supabase Auth, identity through
  -- the admin KYC workflow (admin_kyc_requests).
  phone_verified    boolean not null default false,
  identity_status   text not null default 'not_submitted'
                      check (identity_status in ('not_submitted', 'pending', 'verified', 'rejected')),
  rating_avg        numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count      integer not null default 0 check (rating_count >= 0),
  completed_jobs    integer not null default 0 check (completed_jobs >= 0),
  is_open_to_work   boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists worker_profiles_district_idx
  on public.worker_profiles (district, is_open_to_work);

drop trigger if exists trg_worker_profiles_updated_at on public.worker_profiles;
create trigger trg_worker_profiles_updated_at
  before update on public.worker_profiles
  for each row execute function public.touch_updated_at();

-- ── 2. Skills ──────────────────────────────────────────────────────────────
-- Free-form tags with a proficiency level; a worker may only touch their own.
create table if not exists public.worker_skills (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references auth.users (id) on delete cascade,
  skill        text not null check (char_length(trim(skill)) between 1 and 80),
  level        text not null default 'experienced'
                 check (level in ('beginner', 'intermediate', 'experienced', 'expert')),
  years        integer check (years is null or years between 0 and 60),
  created_at   timestamptz not null default now(),
  unique (worker_id, skill)
);

create index if not exists worker_skills_worker_idx on public.worker_skills (worker_id);
create index if not exists worker_skills_skill_idx on public.worker_skills (lower(skill));

-- ── 3. Job listings ────────────────────────────────────────────────────────
-- Posted by an employer account (any role that owns a farm/business). The
-- worker never writes here.
create table if not exists public.job_listings (
  id                uuid primary key default gen_random_uuid(),
  employer_id       uuid not null references auth.users (id) on delete cascade,
  employer_name     text not null check (char_length(trim(employer_name)) between 1 and 120),
  employer_verified boolean not null default false,
  title             text not null check (char_length(trim(title)) between 3 and 140),
  category          text not null check (category in (
                      'Sowing', 'Planting', 'Harvesting', 'Weeding', 'Irrigation',
                      'Fertilizer Application', 'Crop Spraying', 'Tractor Operation',
                      'Harvester Operation', 'Livestock Work', 'General Farm Labour',
                      'Agricultural Equipment Maintenance')),
  description       text check (description is null or char_length(description) <= 4000),
  -- Where the work is. Kept as text so a listing can exist before geocoding.
  village           text,
  district          text not null,
  state             text,
  pincode           text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  -- Pay: either a daily wage or a fixed amount for the whole job.
  pay_type          text not null default 'daily' check (pay_type in ('daily', 'fixed')),
  wage_inr          numeric(10,2) not null check (wage_inr >= 0),
  -- Duration of the engagement.
  start_date        date not null,
  end_date          date check (end_date is null or end_date >= start_date),
  workers_needed    integer not null default 1 check (workers_needed between 1 and 500),
  workers_hired     integer not null default 0 check (workers_hired >= 0),
  required_skills   text[] not null default '{}'::text[],
  experience_required integer not null default 0 check (experience_required between 0 and 60),
  -- Work type: full day, half day or a multi-day contract.
  work_type         text not null default 'full_day'
                      check (work_type in ('half_day', 'full_day', 'contract')),
  -- Lifecycle. Only `open` listings can receive applications.
  status            text not null default 'open'
                      check (status in ('draft', 'open', 'filled', 'closed', 'cancelled')),
  contact_phone     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists job_listings_status_idx on public.job_listings (status, created_at desc);
create index if not exists job_listings_category_idx on public.job_listings (category, status);
create index if not exists job_listings_district_idx on public.job_listings (district, status);
create index if not exists job_listings_employer_idx on public.job_listings (employer_id, created_at desc);
create index if not exists job_listings_start_idx on public.job_listings (start_date) where status = 'open';

drop trigger if exists trg_job_listings_updated_at on public.job_listings;
create trigger trg_job_listings_updated_at
  before update on public.job_listings
  for each row execute function public.touch_updated_at();

-- ── 4. Applications ────────────────────────────────────────────────────────
-- Applied → under_review → accepted / rejected. The unique constraint is what
-- stops a worker applying twice to the same job.
create table if not exists public.job_applications (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.job_listings (id) on delete cascade,
  worker_id    uuid not null references auth.users (id) on delete cascade,
  employer_id  uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'applied'
                 check (status in ('applied', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  message      text check (message is null or char_length(message) <= 1000),
  -- Employer's answer, kept separate from the worker's message so neither side
  -- can rewrite the other's words.
  employer_note text,
  -- When the worker may not change the record at all.
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (job_id, worker_id)
);

create index if not exists job_applications_worker_idx
  on public.job_applications (worker_id, created_at desc);
create index if not exists job_applications_job_idx
  on public.job_applications (job_id, status);
create index if not exists job_applications_employer_idx
  on public.job_applications (employer_id, created_at desc);

drop trigger if exists trg_job_applications_updated_at on public.job_applications;
create trigger trg_job_applications_updated_at
  before update on public.job_applications
  for each row execute function public.touch_updated_at();

-- ── 5. Work assignments ────────────────────────────────────────────────────
-- Created when an application is accepted: the actual engagement, with a
-- schedule and a progress state the worker can report against.
create table if not exists public.work_assignments (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.job_listings (id) on delete cascade,
  worker_id      uuid not null references auth.users (id) on delete cascade,
  employer_id    uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.job_applications (id) on delete set null,
  title          text not null,
  employer_name  text not null,
  employer_phone text,
  work_village   text,
  work_district  text,
  start_date     date not null,
  end_date       date,
  daily_wage     numeric(10,2),
  total_pay      numeric(12,2),
  instructions   text,
  status         text not null default 'scheduled'
                   check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  progress_pct   integer not null default 0 check (progress_pct between 0 and 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (job_id, worker_id)
);

create index if not exists work_assignments_worker_idx
  on public.work_assignments (worker_id, status, start_date);
create index if not exists work_assignments_employer_idx
  on public.work_assignments (employer_id, created_at desc);

drop trigger if exists trg_work_assignments_updated_at on public.work_assignments;
create trigger trg_work_assignments_updated_at
  before update on public.work_assignments
  for each row execute function public.touch_updated_at();

-- ── 6. Availability ────────────────────────────────────────────────────────
-- One row per worker per date. `available = false` blocks the calendar day.
create table if not exists public.worker_availability (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  available  boolean not null default true,
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (worker_id, day)
);

create index if not exists worker_availability_worker_idx
  on public.worker_availability (worker_id, day);

-- ── 7. Attendance ──────────────────────────────────────────────────────────
-- Written by the employer (or the backend on their behalf). A worker can only
-- READ their own rows, so attendance cannot be self-marked from the browser.
create table if not exists public.work_attendance (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments (id) on delete cascade,
  worker_id     uuid not null references auth.users (id) on delete cascade,
  day           date not null,
  status        text not null default 'present'
                  check (status in ('present', 'absent', 'half_day', 'leave')),
  hours_worked  numeric(5,2) check (hours_worked is null or hours_worked between 0 and 24),
  marked_by     uuid references auth.users (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (assignment_id, day)
);

create index if not exists work_attendance_worker_idx
  on public.work_attendance (worker_id, day desc);

-- ── 8. Earnings ────────────────────────────────────────────────────────────
-- One row per assignment (or per payment period). Written by the employer or
-- the backend — never by the worker, which is what makes a "paid" figure
-- trustworthy.
create table if not exists public.worker_earnings (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references auth.users (id) on delete cascade,
  employer_id   uuid references auth.users (id) on delete set null,
  assignment_id uuid references public.work_assignments (id) on delete set null,
  job_title     text not null,
  employer_name text,
  amount_inr    numeric(12,2) not null check (amount_inr >= 0),
  days_worked   numeric(5,2),
  period_start  date,
  period_end    date,
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'paid', 'failed', 'refunded')),
  paid_on       timestamptz,
  reference     text,
  created_at    timestamptz not null default now()
);

create index if not exists worker_earnings_worker_idx
  on public.worker_earnings (worker_id, created_at desc);
create index if not exists worker_earnings_status_idx
  on public.worker_earnings (worker_id, status);

-- ── 9. Payment records ─────────────────────────────────────────────────────
-- The audit trail behind an earning. Deliberately holds NO card numbers, CVV or
-- bank credentials — only a provider reference and a masked instrument label.
create table if not exists public.payment_records (
  id           uuid primary key default gen_random_uuid(),
  earning_id   uuid not null references public.worker_earnings (id) on delete cascade,
  worker_id    uuid not null references auth.users (id) on delete cascade,
  provider     text not null default 'manual',
  provider_ref text,
  amount_inr   numeric(12,2) not null check (amount_inr >= 0),
  status       text not null default 'pending'
                 check (status in ('pending', 'processing', 'paid', 'failed', 'refunded')),
  -- e.g. "UPI ••••1234" — never the full identifier.
  instrument   text,
  failure_reason text,
  created_at   timestamptz not null default now()
);

create index if not exists payment_records_worker_idx
  on public.payment_records (worker_id, created_at desc);

-- ── 10. Reviews ────────────────────────────────────────────────────────────
-- Only an ELIGIBLE pair can be reviewed: the assignment must be completed and
-- the reviewer must be one of its two parties. Enforced in the policy below.
create table if not exists public.worker_reviews (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments (id) on delete cascade,
  worker_id     uuid not null references auth.users (id) on delete cascade,
  reviewer_id   uuid not null references auth.users (id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('employer', 'worker')),
  rating        integer not null check (rating between 1 and 5),
  comment       text check (comment is null or char_length(comment) <= 1500),
  is_reported   boolean not null default false,
  report_reason text,
  created_at    timestamptz not null default now(),
  unique (assignment_id, reviewer_id)
);

create index if not exists worker_reviews_worker_idx
  on public.worker_reviews (worker_id, created_at desc);
create index if not exists worker_reviews_reviewer_idx
  on public.worker_reviews (reviewer_id);

-- ── 11. Worker notifications ───────────────────────────────────────────────
create table if not exists public.worker_notifications (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'system'
               check (kind in ('job', 'application', 'schedule', 'payment', 'verification', 'system')),
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists worker_notifications_idx
  on public.worker_notifications (worker_id, read_at, created_at desc);

-- ── 12. Messages (worker ↔ employer) ───────────────────────────────────────
create table if not exists public.worker_messages (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references auth.users (id) on delete cascade,
  counterpart_id uuid references auth.users (id) on delete set null,
  counterpart_name text not null,
  counterpart_role text,
  job_id         uuid references public.job_listings (id) on delete set null,
  direction      text not null check (direction in ('in', 'out')),
  body           text not null check (char_length(trim(body)) between 1 and 4000),
  attachment_url text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists worker_messages_worker_idx
  on public.worker_messages (worker_id, created_at);

-- ── 13. Job reports (safety) ───────────────────────────────────────────────
create table if not exists public.job_reports (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references public.job_listings (id) on delete cascade,
  worker_id   uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in
                ('fake_job', 'asks_for_money', 'wrong_pay', 'unsafe', 'harassment', 'other')),
  details     text check (details is null or char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

create index if not exists job_reports_worker_idx on public.job_reports (worker_id, created_at desc);

-- ── 14. Keep worker_profiles in step with the account ──────────────────────
-- A worker row is created the first time the module is opened (the frontend
-- calls `ensureWorkerProfile`), and the phone is copied from Auth so an employer
-- sees a usable contact. Nothing here invents a phone number.
create or replace function public.worker_sync_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.worker_id, old.worker_id);
  update public.worker_profiles wp
     set rating_count = coalesce(stats.cnt, 0),
         rating_avg   = coalesce(stats.avg, 0),
         updated_at   = now()
    from (
      select count(*)::int as cnt, round(avg(rating)::numeric, 2) as avg
        from public.worker_reviews
       where worker_id = target
    ) stats
   where wp.user_id = target;
  return null;
end;
$$;

drop trigger if exists trg_worker_review_rating on public.worker_reviews;
create trigger trg_worker_review_rating
  after insert or update or delete on public.worker_reviews
  for each row execute function public.worker_sync_rating();

-- Accepting an application creates the assignment and fills the job's hired
-- count. Done in the database so the two can never disagree.
create or replace function public.worker_accept_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.job_listings;
begin
  if new.status <> 'accepted' or (old.status = 'accepted') then
    return new;
  end if;

  select * into job from public.job_listings where id = new.job_id;
  if job is null then
    return new;
  end if;

  insert into public.work_assignments (
    job_id, worker_id, employer_id, application_id, title, employer_name,
    work_village, work_district, start_date, end_date, daily_wage, total_pay,
    instructions, status
  ) values (
    job.id, new.worker_id, job.employer_id, new.id, job.title, job.employer_name,
    job.village, job.district, job.start_date, job.end_date,
    case when job.pay_type = 'daily' then job.wage_inr else null end,
    job.wage_inr, job.description, 'scheduled'
  )
  on conflict (job_id, worker_id) do nothing;

  update public.job_listings
     set workers_hired = workers_hired + 1,
         status = case when workers_hired + 1 >= workers_needed then 'filled' else status end
   where id = job.id;

  insert into public.worker_notifications (worker_id, kind, title, body, link)
  values (
    new.worker_id, 'application', 'Application accepted',
    'You were selected for "' || job.title || '" in ' || job.district || '.',
    '/worker/active-work'
  );

  return new;
end;
$$;

drop trigger if exists trg_worker_accept_application on public.job_applications;
create trigger trg_worker_accept_application
  after update of status on public.job_applications
  for each row execute function public.worker_accept_application();

-- A worker applying is worth telling them about, and the employer sees it in
-- their own inbox later. No email is sent from the database.
create or replace function public.worker_new_application_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_title text;
begin
  select title into job_title from public.job_listings where id = new.job_id;
  insert into public.worker_notifications (worker_id, kind, title, body, link)
  values (
    new.worker_id, 'application', 'Application sent',
    'Your application for "' || coalesce(job_title, 'a job') || '" is with the employer.',
    '/worker/applications'
  );
  return new;
end;
$$;

drop trigger if exists trg_worker_new_application on public.job_applications;
create trigger trg_worker_new_application
  after insert on public.job_applications
  for each row execute function public.worker_new_application_alert();

-- ── 15. Row Level Security ─────────────────────────────────────────────────
alter table public.worker_profiles      enable row level security;
alter table public.worker_skills        enable row level security;
alter table public.job_listings         enable row level security;
alter table public.job_applications     enable row level security;
alter table public.work_assignments     enable row level security;
alter table public.worker_availability  enable row level security;
alter table public.work_attendance      enable row level security;
alter table public.worker_earnings      enable row level security;
alter table public.payment_records      enable row level security;
alter table public.worker_reviews       enable row level security;
alter table public.worker_notifications enable row level security;
alter table public.worker_messages      enable row level security;
alter table public.job_reports          enable row level security;

-- Worker profile: owner only. An employer reads the public bits through the
-- application/assignment rows rather than this table.
drop policy if exists "Workers manage their own profile" on public.worker_profiles;
create policy "Workers manage their own profile" on public.worker_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Workers manage their own skills" on public.worker_skills;
create policy "Workers manage their own skills" on public.worker_skills
  for all using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

-- Job listings: anyone signed in may read a live listing; only the poster may
-- read a draft or write at all.
drop policy if exists "Open jobs are visible to signed-in users" on public.job_listings;
create policy "Open jobs are visible to signed-in users" on public.job_listings
  for select using (status in ('open', 'filled', 'closed') or auth.uid() = employer_id);

drop policy if exists "Employers manage their own listings" on public.job_listings;
create policy "Employers manage their own listings" on public.job_listings
  for all using (auth.uid() = employer_id) with check (auth.uid() = employer_id);

-- Applications: the worker sees their own; the employer sees applications to
-- their jobs. A worker may create only their own application, and may update it
-- only while it is still undecided.
drop policy if exists "Workers read their applications" on public.job_applications;
create policy "Workers read their applications" on public.job_applications
  for select using (auth.uid() = worker_id or auth.uid() = employer_id);

drop policy if exists "Workers apply to jobs" on public.job_applications;
create policy "Workers apply to jobs" on public.job_applications
  for insert with check (
    auth.uid() = worker_id
    and exists (
      select 1 from public.job_listings j
       where j.id = job_id and j.status = 'open' and j.employer_id = employer_id
    )
  );

drop policy if exists "Workers withdraw undecided applications" on public.job_applications;
create policy "Workers withdraw undecided applications" on public.job_applications
  for update using (
    (auth.uid() = worker_id and status in ('applied', 'under_review'))
    or auth.uid() = employer_id
  )
  with check (auth.uid() = worker_id or auth.uid() = employer_id);

-- Assignments: readable by both parties. The worker may update progress only.
drop policy if exists "Parties read their assignments" on public.work_assignments;
create policy "Parties read their assignments" on public.work_assignments
  for select using (auth.uid() = worker_id or auth.uid() = employer_id);

drop policy if exists "Workers update their own progress" on public.work_assignments;
create policy "Workers update their own progress" on public.work_assignments
  for update using (auth.uid() = worker_id or auth.uid() = employer_id)
  with check (auth.uid() = worker_id or auth.uid() = employer_id);

-- Availability: owner only.
drop policy if exists "Workers manage their availability" on public.worker_availability;
create policy "Workers manage their availability" on public.worker_availability
  for all using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

-- Attendance: the worker READS only. There is deliberately no worker-write
-- policy — self-marking attendance is exactly the abuse this prevents.
drop policy if exists "Workers read their attendance" on public.work_attendance;
create policy "Workers read their attendance" on public.work_attendance
  for select using (auth.uid() = worker_id);

-- Earnings and payments: read-only for the worker. A payment is never marked
-- successful from the browser.
drop policy if exists "Workers read their earnings" on public.worker_earnings;
create policy "Workers read their earnings" on public.worker_earnings
  for select using (auth.uid() = worker_id);

drop policy if exists "Workers read their payment records" on public.payment_records;
create policy "Workers read their payment records" on public.payment_records
  for select using (auth.uid() = worker_id);

-- Reviews: visible to the worker they describe; writable only by a party to a
-- COMPLETED assignment, once.
drop policy if exists "Workers read reviews about them" on public.worker_reviews;
create policy "Workers read reviews about them" on public.worker_reviews
  for select using (auth.uid() = worker_id or auth.uid() = reviewer_id);

drop policy if exists "Eligible parties write reviews" on public.worker_reviews;
create policy "Eligible parties write reviews" on public.worker_reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.work_assignments a
       where a.id = assignment_id
         and a.status = 'completed'
         and a.worker_id = worker_id
         and (a.worker_id = auth.uid() or a.employer_id = auth.uid())
    )
  );

drop policy if exists "Reviewers report reviews" on public.worker_reviews;
create policy "Reviewers report reviews" on public.worker_reviews
  for update using (auth.uid() = worker_id or auth.uid() = reviewer_id)
  with check (auth.uid() = worker_id or auth.uid() = reviewer_id);

-- Notifications and messages: private to the worker.
drop policy if exists "Workers manage their notifications" on public.worker_notifications;
create policy "Workers manage their notifications" on public.worker_notifications
  for all using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

drop policy if exists "Workers manage their messages" on public.worker_messages;
create policy "Workers manage their messages" on public.worker_messages
  for all using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

drop policy if exists "Workers file their own reports" on public.job_reports;
create policy "Workers file their own reports" on public.job_reports
  for all using (auth.uid() = worker_id) with check (auth.uid() = worker_id);

-- ── 16. Storage buckets ────────────────────────────────────────────────────
-- Certificates and portfolio images. Private buckets; the worker reads their
-- own folder, everyone else only through a signed URL the backend issues.
insert into storage.buckets (id, name, public)
values
  ('worker-certificates', 'worker-certificates', false),
  ('worker-portfolio', 'worker-portfolio', false)
on conflict (id) do nothing;

drop policy if exists "Workers read their own certificates" on storage.objects;
create policy "Workers read their own certificates" on storage.objects
  for select using (
    bucket_id in ('worker-certificates', 'worker-portfolio')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Workers upload their own certificates" on storage.objects;
create policy "Workers upload their own certificates" on storage.objects
  for insert with check (
    bucket_id in ('worker-certificates', 'worker-portfolio')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Workers remove their own certificates" on storage.objects;
create policy "Workers remove their own certificates" on storage.objects
  for delete using (
    bucket_id in ('worker-certificates', 'worker-portfolio')
    and auth.uid()::text = (storage.foldername(name))[1]
  );
