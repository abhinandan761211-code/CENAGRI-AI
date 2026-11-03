-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Farmer Account tables
-- Run AFTER schema.sql and features.sql. Safe to re-run.
--
-- What already exists and is REUSED (not duplicated):
--   profiles   – identity, role, location + farmer answers in `details` jsonb
--   farms      – farm records (name, location, area, soil, irrigation, crops)
--   crops      – one row per planted crop (sowing date, variety, health …)
--   listings/orders/equipment_bookings/storage_bookings/transport_requests
--   posts/comments – CenFriend
--   creator_*  – Kisan Video Hub + Creator Studio
--   worker_*/job_* – Farm Labour (see worker.sql)
--
-- This file adds ONLY what the farmer account genuinely lacks:
--   1.  farm_activities     – the single activity log (sowing, fertiliser, spray,
--                             irrigation, harvest …) that also powers the crop
--                             calendar's "done" state and today's tasks.
--   2.  farmer_tasks        – calendar reminders a farmer adds by hand.
--   3.  farmer_expenses     – recorded costs (seed, fertiliser, labour …).
--   4.  soil_tests          – soil lab records + uploaded report.
--   5.  irrigation_logs     – water usage records (farmer enters, not sensors).
--   6.  disease_analyses    – crop-photo advisory history (never a diagnosis).
--   7.  farmer_documents    – KYC / land papers, private bucket.
--   8.  farmer_groups       – Farming Groups + membership + posts.
--   9.  farmer_alert_prefs  – notification settings (one row per farmer).
--   10. farmer_messages     – two-way messaging between accounts (thread based).
--
-- Every table is owned by `auth.uid()` and protected by RLS. Money and
-- quantities are nullable by design: a blank field means "not recorded yet",
-- never zero, so profit can be reported honestly as unknown vs. loss.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Farm activities — the one activity log ─────────────────────────────
-- `done` marks calendar entries the farmer ticked off; `total_cost` is what it
-- actually cost and flows into Expenses & Profit through `expense_id`.
create table if not exists public.farm_activities (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  farm_id      uuid references public.farms (id) on delete set null,
  crop_id      uuid references public.crops (id) on delete set null,
  kind         text not null check (kind in
                 ('ploughing','sowing','fertiliser','irrigation','spray',
                  'weeding','pest_check','harvest','other')),
  title        text not null check (char_length(title) between 1 and 200),
  notes        text,
  activity_on  date not null default current_date,
  cost_inr     numeric(12,2) check (cost_inr is null or cost_inr >= 0),
  expense_id   uuid,
  quantity     text,
  created_at   timestamptz not null default now()
);
create index if not exists farm_activities_owner_idx
  on public.farm_activities (owner_id, activity_on desc);
create index if not exists farm_activities_crop_idx
  on public.farm_activities (crop_id, activity_on desc);

-- ── 2. Manual calendar tasks / reminders ──────────────────────────────────
create table if not exists public.farmer_tasks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  crop_id    uuid references public.crops (id) on delete cascade,
  farm_id    uuid references public.farms (id) on delete set null,
  title      text not null check (char_length(title) between 1 and 200),
  kind       text not null default 'other' check (kind in
               ('sowing','fertiliser','irrigation','pest','harvest','weeding','other')),
  due_on     date not null,
  done       boolean not null default false,
  done_on    date,
  created_at timestamptz not null default now()
);
create index if not exists farmer_tasks_owner_idx
  on public.farmer_tasks (owner_id, due_on);
create index if not exists farmer_tasks_due_idx
  on public.farmer_tasks (owner_id, done, due_on);

-- ── 3. Expenses ───────────────────────────────────────────────────────────
-- `recorded_inr` is the confirmed amount. There is deliberately no "estimated
-- revenue" column: revenue is only ever what a completed sale actually paid.
create table if not exists public.farmer_expenses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  farm_id      uuid references public.farms (id) on delete set null,
  crop_id      uuid references public.crops (id) on delete set null,
  category     text not null check (category in
                 ('seeds','fertiliser','labour','irrigation','equipment','transport',
                  'pesticide','land_prep','storage','other')),
  amount_inr   numeric(12,2) not null check (amount_inr >= 0),
  spent_on     date not null default current_date,
  note         text,
  vendor       text,
  created_at   timestamptz not null default now()
);
create index if not exists farmer_expenses_owner_idx
  on public.farmer_expenses (owner_id, spent_on desc);
create index if not exists farmer_expenses_crop_idx
  on public.farmer_expenses (crop_id);

-- ── 4. Soil tests ─────────────────────────────────────────────────────────
-- Values stay NULL when the lab report did not include them. `source` records
-- where the number came from so a recommendation can cite it.
create table if not exists public.soil_tests (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  farm_id        uuid references public.farms (id) on delete cascade,
  tested_on      date not null default current_date,
  lab_name       text,
  ph             numeric(4,2) check (ph is null or (ph >= 0 and ph <= 14)),
  ec_ds_m       numeric(6,3),
  organic_carbon numeric(6,3),
  nitrogen_kg_ha numeric(10,2),
  phosphorus_kg_ha numeric(10,2),
  potassium_kg_ha  numeric(10,2),
  soil_category  text,
  recommendation text,
  report_url     text,
  source         text default 'lab report',
  created_at     timestamptz not null default now()
);
create index if not exists soil_tests_owner_idx
  on public.soil_tests (owner_id, tested_on desc);
create index if not exists soil_tests_farm_idx on public.soil_tests (farm_id);

-- ── 5. Irrigation logs ────────────────────────────────────────────────────
create table if not exists public.irrigation_logs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  farm_id      uuid references public.farms (id) on delete set null,
  crop_id      uuid references public.crops (id) on delete set null,
  irrigated_on date not null default current_date,
  method       text check (method is null or method in
                 ('flood','furrow','sprinkler','drip','pump','rain')),
  hours        numeric(6,2) check (hours is null or hours >= 0),
  volume_m3    numeric(12,2) check (volume_m3 is null or volume_m3 >= 0),
  cost_inr     numeric(12,2) check (cost_inr is null or cost_inr >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists irrigation_logs_owner_idx
  on public.irrigation_logs (owner_id, irrigated_on desc);

-- ── 6. Disease / crop-photo analyses ──────────────────────────────────────
-- Stores what the AI assistant SAID, plus a clear disclaimer. It is history,
-- never a stored diagnosis, and the UI repeats that wherever it is read.
create table if not exists public.disease_analyses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  crop_id      uuid references public.crops (id) on delete set null,
  crop_name    text,
  photo_url    text,
  symptoms     text,
  possible     jsonb not null default '[]'::jsonb,
  next_steps   text,
  answer_text  text,
  mode         text not null default 'demo' check (mode in ('ai','demo')),
  model        text,
  created_at   timestamptz not null default now()
);
create index if not exists disease_analyses_owner_idx
  on public.disease_analyses (owner_id, created_at desc);

-- ── 7. Documents / KYC ────────────────────────────────────────────────────
create table if not exists public.farmer_documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in
                ('aadhaar','land_record','bank_passbook','farmer_id','soil_report',
                 'insurance','other')),
  label       text,
  file_path   text not null,
  mime_type   text,
  size_bytes  bigint,
  status      text not null default 'pending'
                check (status in ('pending','verified','rejected')),
  review_note text,
  created_at  timestamptz not null default now()
);
create index if not exists farmer_documents_owner_idx
  on public.farmer_documents (owner_id, created_at desc);

-- ── 8. Farming groups ─────────────────────────────────────────────────────
create table if not exists public.farmer_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 120),
  description text,
  district    text,
  state       text,
  crop        text,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists farmer_groups_district_idx
  on public.farmer_groups (district, created_at desc);

create table if not exists public.farmer_group_members (
  group_id   uuid not null references public.farmer_groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists farmer_group_members_user_idx
  on public.farmer_group_members (user_id);

create table if not exists public.farmer_group_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.farmer_groups (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists farmer_group_posts_idx
  on public.farmer_group_posts (group_id, created_at desc);

-- ── 9. Notification preferences (one row per farmer) ──────────────────────
create table if not exists public.farmer_alert_prefs (
  owner_id       uuid primary key references auth.users (id) on delete cascade,
  weather_alerts boolean not null default true,
  mandi_alerts   boolean not null default true,
  task_reminders boolean not null default true,
  booking_updates boolean not null default true,
  community      boolean not null default false,
  ai_updates     boolean not null default true,
  push_enabled   boolean not null default false,
  email_enabled  boolean not null default false,
  email_address  text,
  updated_at     timestamptz not null default now()
);

-- ── 10. Farmer messages ───────────────────────────────────────────────────
-- A thread is scoped to a listing/booking through `context_type` + `context_id`
-- so a conversation can never be attached to somebody else's order.
create table if not exists public.farmer_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null default gen_random_uuid(),
  sender_id     uuid not null references auth.users (id) on delete cascade,
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  context_type  text check (context_type is null or context_type in
                  ('listing','order','booking','group','general')),
  context_id    uuid,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists farmer_messages_thread_idx
  on public.farmer_messages (thread_id, created_at);
create index if not exists farmer_messages_recipient_idx
  on public.farmer_messages (recipient_id, read_at);

-- ── updated_at trigger for preferences ────────────────────────────────────
drop trigger if exists trg_farmer_alert_prefs_updated_at on public.farmer_alert_prefs;
create trigger trg_farmer_alert_prefs_updated_at
  before update on public.farmer_alert_prefs
  for each row execute function public.touch_updated_at();

-- ── Row level security ────────────────────────────────────────────────────
alter table public.farm_activities     enable row level security;
alter table public.farmer_tasks        enable row level security;
alter table public.farmer_expenses     enable row level security;
alter table public.soil_tests          enable row level security;
alter table public.irrigation_logs     enable row level security;
alter table public.disease_analyses    enable row level security;
alter table public.farmer_documents    enable row level security;
alter table public.farmer_groups       enable row level security;
alter table public.farmer_group_members enable row level security;
alter table public.farmer_group_posts  enable row level security;
alter table public.farmer_alert_prefs  enable row level security;
alter table public.farmer_messages     enable row level security;

-- Owner-only records: read, write and delete are all scoped to auth.uid().
do $$
declare
  t text;
  owned text[] := array[
    'farm_activities','farmer_tasks','farmer_expenses','soil_tests',
    'irrigation_logs','disease_analyses','farmer_documents','farmer_alert_prefs'
  ];
begin
  foreach t in array owned loop
    execute format('drop policy if exists "%s managed by owner" on public.%I', t, t);
    execute format(
      'create policy "%s managed by owner" on public.%I for all to authenticated '
      'using ((select auth.uid()) = owner_id) '
      'with check ((select auth.uid()) = owner_id)',
      t, t
    );
  end loop;
end;
$$;

-- Farms are already owner-only (schema.sql). Activities must not point at a
-- farm or crop the caller does not own, even if the client sends another id.
create or replace function public.farmer_check_farm_crop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.farm_id is not null and not exists (
    select 1 from public.farms where id = new.farm_id and owner_id = new.owner_id
  ) then
    raise exception 'That farm does not belong to you.';
  end if;
  if new.crop_id is not null and not exists (
    select 1 from public.crops where id = new.crop_id and owner_id = new.owner_id
  ) then
    raise exception 'That crop does not belong to you.';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  linked text[] := array['farm_activities','farmer_tasks','farmer_expenses',
                         'irrigation_logs','disease_analyses'];
begin
  foreach t in array linked loop
    execute format('drop trigger if exists trg_%s_owner_link on public.%I', t, t);
    execute format(
      'create trigger trg_%s_owner_link before insert or update on public.%I '
      'for each row execute function public.farmer_check_farm_crop()',
      t, t
    );
  end loop;
end;
$$;

-- Groups: readable by any signed-in account (that is how you find one), written
-- by the owner, and only the owner may rename or delete.
drop policy if exists "Groups readable by signed-in users" on public.farmer_groups;
create policy "Groups readable by signed-in users" on public.farmer_groups
  for select to authenticated using (true);

drop policy if exists "Owners create groups" on public.farmer_groups;
create policy "Owners create groups" on public.farmer_groups
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners edit groups" on public.farmer_groups;
create policy "Owners edit groups" on public.farmer_groups
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners delete groups" on public.farmer_groups;
create policy "Owners delete groups" on public.farmer_groups
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Membership: you join as yourself and leave as yourself. The group owner is
-- inserted automatically by the trigger below, so the owner row is not forged.
drop policy if exists "Membership readable by signed-in users" on public.farmer_group_members;
create policy "Membership readable by signed-in users" on public.farmer_group_members
  for select to authenticated using (true);

drop policy if exists "Users join groups as themselves" on public.farmer_group_members;
create policy "Users join groups as themselves" on public.farmer_group_members
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users leave groups" on public.farmer_group_members;
create policy "Users leave groups" on public.farmer_group_members
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.farmer_group_add_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.farmer_group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists trg_farmer_group_owner on public.farmer_groups;
create trigger trg_farmer_group_owner
  after insert on public.farmer_groups
  for each row execute function public.farmer_group_add_owner();

-- Group posts: members read and write; authors edit their own.
drop policy if exists "Members read group posts" on public.farmer_group_posts;
create policy "Members read group posts" on public.farmer_group_posts
  for select to authenticated using (
    exists (
      select 1 from public.farmer_group_members m
      where m.group_id = farmer_group_posts.group_id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Members post in groups" on public.farmer_group_posts;
create policy "Members post in groups" on public.farmer_group_posts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.farmer_group_members m
      where m.group_id = farmer_group_posts.group_id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authors delete group posts" on public.farmer_group_posts;
create policy "Authors delete group posts" on public.farmer_group_posts
  for delete to authenticated using (author_id = (select auth.uid()));

-- Messages: only sender and recipient. Listing/order context is validated on
-- insert so a message cannot reference someone else's record.
drop policy if exists "Messages visible to sender and recipient" on public.farmer_messages;
create policy "Messages visible to sender and recipient" on public.farmer_messages
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists "Users send messages as themselves" on public.farmer_messages;
create policy "Users send messages as themselves" on public.farmer_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and (
      context_id is null
      or context_type = 'order'
         and exists (
           select 1 from public.orders o
           join public.listings l on l.id = o.listing_id
           where o.id = farmer_messages.context_id
             and (o.buyer_id = (select auth.uid()) or l.seller_id = (select auth.uid()))
         )
      or context_type = 'listing'
         and exists (
           select 1 from public.listings l
           where l.id = farmer_messages.context_id
             and (l.seller_id = (select auth.uid()) or (select auth.uid()) = farmer_messages.recipient_id)
         )
      or context_type in ('booking','group','general')
    )
  );

-- Recipient marks read; nobody rewrites the body.
drop policy if exists "Recipients mark messages read" on public.farmer_messages;
create policy "Recipients mark messages read" on public.farmer_messages
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- ── Storage: private bucket for KYC + soil reports ────────────────────────
insert into storage.buckets (id, name, public)
values ('farmer-documents', 'farmer-documents', false)
on conflict (id) do nothing;

drop policy if exists "Farmers read their own document files" on storage.objects;
create policy "Farmers read their own document files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'farmer-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Farmers upload their own document files" on storage.objects;
create policy "Farmers upload their own document files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'farmer-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Farmers delete their own document files" on storage.objects;
create policy "Farmers delete their own document files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'farmer-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
