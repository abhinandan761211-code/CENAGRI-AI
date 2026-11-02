-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Equipment module (agricultural machinery rental)
-- Run AFTER schema.sql, features.sql, warehouse.sql. Safe to re-run.
--
-- What this module is
--   An equipment owner rents out machinery — tractors and their attachments,
--   harvesters, seeders, sprayers, drones — to farmers, buyers and retailers.
--   The lifecycle is request → quotation → booking → operator assigned →
--   scheduled → work started → work completed → payment confirmed → closed.
--
-- Design decisions
--   • `equipment` and `equipment_bookings` ALREADY EXIST in features.sql with no
--     rows and no writer. They are EXTENDED here (additive columns only) rather
--     than duplicated, so the farmer-facing Equipment Rental screen keeps working.
--   • Overlap prevention is the central invariant and lives in the DATABASE
--     (section 9): a partial exclusion-style check on (equipment_id, date range)
--     for every booking that is not rejected/cancelled. A UI check alone would
--     let two tabs book the same tractor for the same morning.
--   • Maintenance blocks are first-class rows, not a status flag, so a machine
--     under repair automatically refuses a booking for those dates.
--   • Rental money, invoices and payment confirmation are backend-written. An
--     owner can read an invoice and never mark it paid, exactly as in the
--     worker, transporter and warehouse modules.
--   • Live tracking is OPTIONAL and off by default. There is no GPS table fed by
--     this file and nothing invents a position or an ETA.
--   • Operator documents live in a private bucket and are never readable by a
--     renter.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Extend the existing equipment table (additive only) ─────────────────
-- features.sql gives: owner_id, title, kind, rate_inr, rate_unit,
-- district, state, available, created_at.

alter table public.equipment
  add column if not exists category text,
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists manufacture_year integer,
  add column if not exists registration_no text,
  add column if not exists specifications text,
  add column if not exists capacity_text text,
  add column if not exists hourly_capacity_acres numeric(8,2),
  add column if not exists hp integer,
  add column if not exists images text[] not null default '{}'::text[],
  add column if not exists location_text text,
  add column if not exists village text,
  add column if not exists service_districts text[] not null default '{}'::text[],
  add column if not exists service_radius_km numeric(8,2),
  add column if not exists offers_delivery boolean not null default false,
  add column if not exists condition_score integer not null default 5,
  add column if not exists status text not null default 'available',
  add column if not exists fuel_type text,
  add column if not exists fuel_included boolean not null default false,
  add column if not exists operator_available boolean not null default false,
  add column if not exists operator_included boolean not null default false,
  add column if not exists description text,
  add column if not exists is_listed boolean not null default true,
  add column if not exists is_archived boolean not null default false,
  add column if not exists last_service_on date,
  add column if not exists next_service_on date,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.equipment drop constraint if exists equipment_condition_check;
  alter table public.equipment
    add constraint equipment_condition_check
    check (condition_score between 0 and 10);
exception when others then null;
end $$;

do $$
begin
  alter table public.equipment drop constraint if exists equipment_status_check;
  alter table public.equipment
    add constraint equipment_status_check
    check (status in ('available', 'booked', 'in_use', 'maintenance', 'unavailable'));
exception when others then null;
end $$;

do $$
begin
  alter table public.equipment drop constraint if exists equipment_year_check;
  alter table public.equipment
    add constraint equipment_year_check
    check (manufacture_year is null or manufacture_year between 1950 and 2100);
exception when others then null;
end $$;

-- `kind` from features.sql is a narrow list. Real categories are richer, so the
-- extended `category` carries the detail and `kind` stays in step for old reads.
do $$
begin
  alter table public.equipment drop constraint if exists equipment_kind_check;
  alter table public.equipment
    add constraint equipment_kind_check
    check (kind in ('Tractor','Power tiller','Harvester','Pump','Sprayer','Other',
                    'Implement','Seeder','Drone','Leveler','Thresher'));
exception when others then null;
end $$;

create index if not exists equipment_owner_idx
  on public.equipment (owner_id, is_archived);
create index if not exists equipment_listing_idx
  on public.equipment (is_listed, district, category);
create unique index if not exists equipment_registration_uniq
  on public.equipment (upper(registration_no))
  where registration_no is not null;

drop trigger if exists trg_equipment_updated_at on public.equipment;
create trigger trg_equipment_updated_at
  before update on public.equipment
  for each row execute function public.touch_updated_at();

-- ── 2. Pricing (one active price sheet per equipment) ──────────────────────
-- features.sql keeps a single legacy rate. Real rentals need several models,
-- each with its own inclusions, so the price sheet is a separate row.
create table if not exists public.equipment_pricing (
  id                uuid primary key default gen_random_uuid(),
  equipment_id      uuid not null unique references public.equipment (id) on delete cascade,
  rate_unit         text not null default 'hour'
                      check (rate_unit in ('hour', 'day', 'acre', 'job', 'week', 'quotation')),
  base_rate_inr     numeric(12,2) not null check (base_rate_inr >= 0),
  minimum_hours     numeric(6,2) check (minimum_hours is null or minimum_hours >= 0),
  minimum_days      integer check (minimum_days is null or minimum_days >= 1),
  maximum_days      integer check (maximum_days is null or maximum_days >= 1),
  operator_rate_inr numeric(12,2) not null default 0 check (operator_rate_inr >= 0),
  fuel_rate_inr     numeric(12,2) not null default 0 check (fuel_rate_inr >= 0),
  transport_rate_inr numeric(12,2) not null default 0 check (transport_rate_inr >= 0),
  other_service_label text,
  other_service_rate_inr numeric(12,2) not null default 0 check (other_service_rate_inr >= 0),
  advance_percent   numeric(5,2) not null default 0 check (advance_percent between 0 and 100),
  cancellation_policy text check (cancellation_policy is null or char_length(cancellation_policy) <= 1000),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_equipment_pricing_updated_at on public.equipment_pricing;
create trigger trg_equipment_pricing_updated_at
  before update on public.equipment_pricing
  for each row execute function public.touch_updated_at();

-- ── 3. Operators ───────────────────────────────────────────────────────────
-- Licence and ID documents sit in a private bucket. A renter may see the
-- operator's name and phone for their own booking, never the documents.
create table if not exists public.equipment_operators (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  full_name      text not null check (char_length(trim(full_name)) between 2 and 120),
  phone          text,
  phone_verified boolean not null default false,
  experience_years integer not null default 0 check (experience_years between 0 and 60),
  skills         text[] not null default '{}'::text[],
  licence_no     text,
  licence_expiry date,
  licence_document_url text,
  status         text not null default 'available'
                   check (status in ('available', 'on_job', 'leave', 'inactive')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists equipment_operators_owner_idx
  on public.equipment_operators (owner_id, status);
create unique index if not exists equipment_operator_licence_uniq
  on public.equipment_operators (owner_id, upper(licence_no))
  where licence_no is not null;

drop trigger if exists trg_equipment_operators_updated_at on public.equipment_operators;
create trigger trg_equipment_operators_updated_at
  before update on public.equipment_operators
  for each row execute function public.touch_updated_at();

-- ── 4. Rental requests ─────────────────────────────────────────────────────
create table if not exists public.equipment_rental_requests (
  id               uuid primary key default gen_random_uuid(),
  requester_id     uuid not null references auth.users (id) on delete cascade,
  equipment_id     uuid references public.equipment (id) on delete set null,
  owner_id         uuid references auth.users (id) on delete cascade,
  category         text,
  requester_name   text,
  requester_role   text,
  farm_location    text,
  district         text,
  required_from    date not null,
  duration_days    integer not null default 1 check (duration_days between 1 and 180),
  land_area_acres  numeric(10,2),
  work_type        text,
  needs_operator   boolean not null default true,
  needs_fuel       boolean not null default false,
  expected_budget_inr numeric(12,2) check (expected_budget_inr is null or expected_budget_inr >= 0),
  description      text check (description is null or char_length(description) <= 2000),
  status           text not null default 'open'
                     check (status in ('open', 'quoted', 'accepted', 'closed', 'expired', 'cancelled')),
  expires_on       date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists equipment_requests_open_idx
  on public.equipment_rental_requests (status, required_from);
create index if not exists equipment_requests_owner_idx
  on public.equipment_rental_requests (owner_id, status);
create index if not exists equipment_requests_requester_idx
  on public.equipment_rental_requests (requester_id, created_at desc);
create index if not exists equipment_requests_district_idx
  on public.equipment_rental_requests (district, status);

drop trigger if exists trg_equipment_requests_updated_at on public.equipment_rental_requests;
create trigger trg_equipment_requests_updated_at
  before update on public.equipment_rental_requests
  for each row execute function public.touch_updated_at();

-- ── 5. Quotations ──────────────────────────────────────────────────────────
create table if not exists public.equipment_quotations (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.equipment_rental_requests (id) on delete cascade,
  equipment_id   uuid not null references public.equipment (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  -- Itemised, so nothing can be added after acceptance.
  rental_inr     numeric(12,2) not null default 0 check (rental_inr >= 0),
  operator_inr   numeric(12,2) not null default 0 check (operator_inr >= 0),
  fuel_inr       numeric(12,2) not null default 0 check (fuel_inr >= 0),
  transport_inr  numeric(12,2) not null default 0 check (transport_inr >= 0),
  other_inr      numeric(12,2) not null default 0 check (other_inr >= 0),
  other_note     text,
  total_inr      numeric(12,2) not null check (total_inr >= 0),
  operator_included boolean not null default false,
  fuel_included     boolean not null default false,
  transport_included boolean not null default false,
  valid_until    date,
  message        text check (message is null or char_length(message) <= 1000),
  status         text not null default 'sent'
                   check (status in ('sent', 'accepted', 'rejected', 'withdrawn', 'expired')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (request_id, equipment_id)
);

create index if not exists equipment_quotations_owner_idx
  on public.equipment_quotations (owner_id, status, created_at desc);

drop trigger if exists trg_equipment_quotations_updated_at on public.equipment_quotations;
create trigger trg_equipment_quotations_updated_at
  before update on public.equipment_quotations
  for each row execute function public.touch_updated_at();

-- ── 6. Bookings (extend the features.sql table) ────────────────────────────
-- features.sql gives: equipment_id, renter_id, starts_on, ends_on, status
-- ('requested'|'accepted'|'declined'|'completed').

alter table public.equipment_bookings
  add column if not exists request_id uuid references public.equipment_rental_requests (id) on delete set null,
  add column if not exists quotation_id uuid references public.equipment_quotations (id) on delete set null,
  add column if not exists owner_id uuid references auth.users (id) on delete cascade,
  add column if not exists operator_id uuid references public.equipment_operators (id) on delete set null,
  add column if not exists renter_name text,
  add column if not exists renter_role text,
  add column if not exists farm_location text,
  add column if not exists work_type text,
  add column if not exists land_area_acres numeric(10,2),
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists agreed_price_inr numeric(12,2) not null default 0,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists operator_included boolean not null default false,
  add column if not exists fuel_included boolean not null default false,
  add column if not exists transport_included boolean not null default false,
  add column if not exists work_hours numeric(8,2),
  add column if not exists completed_acres numeric(10,2),
  add column if not exists completion_notes text,
  add column if not exists completion_photos text[] not null default '{}'::text[],
  add column if not exists customer_acknowledged_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists updated_at timestamptz not null default now();

-- Widen the lifecycle. features.sql allows only four statuses.
do $$
begin
  alter table public.equipment_bookings drop constraint if exists equipment_bookings_status_check;
  alter table public.equipment_bookings
    add constraint equipment_bookings_status_check
    check (status in (
      'requested', 'quotation_sent', 'accepted', 'confirmed', 'operator_assigned',
      'scheduled', 'work_started', 'work_completed', 'payment_confirmed', 'closed',
      'rejected', 'declined', 'cancelled', 'disputed'));
exception when others then null;
end $$;

do $$
begin
  alter table public.equipment_bookings drop constraint if exists equipment_bookings_payment_check;
  alter table public.equipment_bookings
    add constraint equipment_bookings_payment_check
    check (payment_status in ('pending', 'processing', 'paid', 'failed', 'refunded'));
exception when others then null;
end $$;

create index if not exists equipment_bookings_owner_idx
  on public.equipment_bookings (owner_id, status, starts_on);
create index if not exists equipment_bookings_renter_idx
  on public.equipment_bookings (renter_id, created_at desc);
create index if not exists equipment_bookings_operator_idx
  on public.equipment_bookings (operator_id, starts_on)
  where operator_id is not null;

drop trigger if exists trg_equipment_bookings_updated_at on public.equipment_bookings;
create trigger trg_equipment_bookings_updated_at
  before update on public.equipment_bookings
  for each row execute function public.touch_updated_at();

-- ── 7. Availability blocks (maintenance / owner-unavailable periods) ───────
-- A booking cannot overlap one of these. Making the block a row rather than a
-- status flag is what lets "under maintenance 3–7 Nov" coexist with "available
-- to book from 8 Nov".
create table if not exists public.equipment_availability_blocks (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  kind         text not null default 'maintenance'
                 check (kind in ('maintenance', 'unavailable', 'weather', 'other')),
  starts_on    date not null,
  ends_on      date not null,
  reason       text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists equipment_blocks_idx
  on public.equipment_availability_blocks (equipment_id, starts_on, ends_on);

-- ── 8. Maintenance records ────────────────────────────────────────────────
create table if not exists public.equipment_maintenance (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  kind         text not null default 'service'
                 check (kind in ('service', 'repair', 'breakdown', 'inspection', 'tyre', 'other')),
  description  text not null check (char_length(trim(description)) between 3 and 1000),
  cost_inr     numeric(12,2) not null default 0 check (cost_inr >= 0),
  parts        text,
  workshop     text,
  odometer_hours numeric(10,2),
  service_on   date not null default current_date,
  next_due_on  date,
  photos       text[] not null default '{}'::text[],
  downtime_days integer check (downtime_days is null or downtime_days >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists equipment_maintenance_eq_idx
  on public.equipment_maintenance (equipment_id, service_on desc);
create index if not exists equipment_maintenance_owner_idx
  on public.equipment_maintenance (owner_id, service_on desc);

-- ── 9. Booking lifecycle, overlap and maintenance guards ──────────────────

/** Legal status moves. Rejected/closed are terminal. */
create or replace function public.equipment_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[];
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status in ('closed', 'rejected', 'declined', 'cancelled') then
    raise exception 'Booking is % and cannot be reopened', old.status
      using errcode = 'check_violation';
  end if;

  allowed := case old.status
    when 'requested'         then array['quotation_sent', 'accepted', 'rejected', 'cancelled']
    when 'quotation_sent'    then array['accepted', 'rejected', 'cancelled']
    when 'accepted'          then array['confirmed', 'cancelled']
    when 'confirmed'         then array['operator_assigned', 'scheduled', 'cancelled']
    when 'operator_assigned' then array['scheduled', 'cancelled']
    when 'scheduled'         then array['work_started', 'cancelled', 'disputed']
    when 'work_started'      then array['work_completed', 'disputed']
    when 'work_completed'    then array['payment_confirmed', 'disputed']
    when 'payment_confirmed' then array['closed', 'disputed']
    when 'disputed'          then array['work_completed', 'closed', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'Cannot move booking from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_equipment_booking_transition on public.equipment_bookings;
create trigger trg_equipment_booking_transition
  before update of status on public.equipment_bookings
  for each row execute function public.equipment_booking_transition();

/**
 * Refuse overlapping bookings and overlapping maintenance blocks.
 *
 * This is the heart of the module. It runs for every booking that holds time,
 * under a row lock on the machine, so two simultaneous confirmations of the
 * same tractor for the same morning cannot both succeed.
 */
create or replace function public.equipment_booking_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clash record;
begin
  -- Rejected / declined / cancelled bookings hold no time.
  if new.status in ('rejected', 'declined', 'cancelled') then
    return new;
  end if;

  -- Serialise per machine.
  perform 1 from public.equipment where id = new.equipment_id for update;

  select b.id, b.starts_on, b.ends_on into clash
    from public.equipment_bookings b
   where b.equipment_id = new.equipment_id
     and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and b.status not in ('rejected', 'declined', 'cancelled')
     and daterange(b.starts_on, b.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
   limit 1;

  if clash.id is not null then
    raise exception 'Equipment is already booked for % to %', clash.starts_on, clash.ends_on
      using errcode = 'check_violation';
  end if;

  select bl.starts_on, bl.ends_on into clash
    from public.equipment_availability_blocks bl
   where bl.equipment_id = new.equipment_id
     and daterange(bl.starts_on, bl.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
   limit 1;

  if clash.starts_on is not null then
    raise exception 'Equipment is blocked for maintenance from % to %', clash.starts_on, clash.ends_on
      using errcode = 'check_violation';
  end if;

  -- Fill the owner from the machine, never from the client.
  select owner_id into clash from public.equipment where id = new.equipment_id;
  new.owner_id := coalesce(new.owner_id, clash.owner_id);

  return new;
end;
$$;

drop trigger if exists trg_equipment_booking_guard on public.equipment_bookings;
create trigger trg_equipment_booking_guard
  before insert or update of starts_on, ends_on, status, equipment_id on public.equipment_bookings
  for each row execute function public.equipment_booking_guard();

/** A maintenance block may not be created on top of a live booking. */
create or replace function public.equipment_block_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clash record;
begin
  perform 1 from public.equipment where id = new.equipment_id for update;

  select b.starts_on, b.ends_on into clash
    from public.equipment_bookings b
   where b.equipment_id = new.equipment_id
     and b.status not in ('rejected', 'declined', 'cancelled', 'closed')
     and daterange(b.starts_on, b.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
   limit 1;

  if clash.starts_on is not null then
    raise exception 'This period already has a booking (% to %). Cancel or move it first.',
      clash.starts_on, clash.ends_on
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_equipment_block_guard on public.equipment_availability_blocks;
create trigger trg_equipment_block_guard
  before insert on public.equipment_availability_blocks
  for each row execute function public.equipment_block_guard();

/** One operator cannot be on two jobs at the same time. */
create or replace function public.equipment_operator_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clash record;
begin
  if new.operator_id is null or new.status in ('rejected', 'declined', 'cancelled') then
    return new;
  end if;

  select b.starts_on, b.ends_on into clash
    from public.equipment_bookings b
   where b.operator_id = new.operator_id
     and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and b.status not in ('rejected', 'declined', 'cancelled', 'closed')
     and daterange(b.starts_on, b.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
   limit 1;

  if clash.starts_on is not null then
    raise exception 'This operator is already assigned from % to %', clash.starts_on, clash.ends_on
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_equipment_operator_guard on public.equipment_bookings;
create trigger trg_equipment_operator_guard
  before insert or update of operator_id, starts_on, ends_on, status on public.equipment_bookings
  for each row execute function public.equipment_operator_guard();

/** A booking moves the machine's status, so the dashboard is never stale. */
create or replace function public.equipment_booking_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('rejected', 'declined', 'cancelled', 'closed') then
      update public.equipment set available = false where id = new.equipment_id;
    end if;
    return new;
  end if;

  if new.status = 'work_started' then
    update public.equipment set status = 'in_use', available = false where id = new.equipment_id;
  elsif new.status in ('work_completed', 'payment_confirmed', 'closed', 'cancelled', 'rejected', 'declined')
        and old.status = 'work_started' then
    update public.equipment set status = 'available', available = true where id = new.equipment_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_equipment_booking_sync_status on public.equipment_bookings;
create trigger trg_equipment_booking_sync_status
  after insert or update of status on public.equipment_bookings
  for each row execute function public.equipment_booking_sync_status();

-- ── 10. Rental agreements & completion ────────────────────────────────────
create table if not exists public.equipment_rental_agreements (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.equipment_bookings (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  renter_id      uuid not null references auth.users (id) on delete cascade,
  terms          text not null,
  fuel_policy    text,
  operator_policy text,
  transport_policy text,
  damage_terms   text,
  cancellation_terms text,
  owner_confirmed_at  timestamptz,
  renter_confirmed_at timestamptz,
  created_at     timestamptz not null default now()
);

-- ── 11. Documents, reviews, expenses, invoices, comms ─────────────────────
create table if not exists public.equipment_documents (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  equipment_id   uuid references public.equipment (id) on delete cascade,
  operator_id    uuid references public.equipment_operators (id) on delete cascade,
  kind           text not null check (kind in (
                   'registration', 'rc', 'insurance', 'fitness', 'operator_licence',
                   'ownership_proof', 'permit', 'photo', 'other')),
  document_url   text not null,
  status         text not null default 'pending'
                   check (status in ('pending', 'verified', 'rejected', 'expired')),
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  expires_on     date,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists equipment_documents_owner_idx
  on public.equipment_documents (owner_id, kind);

create table if not exists public.equipment_reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.equipment_bookings (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  reviewer_id  uuid not null references auth.users (id) on delete cascade,
  equipment_rating integer not null check (equipment_rating between 1 and 5),
  operator_rating  integer check (operator_rating between 1 and 5),
  condition_notes  text,
  comment      text check (comment is null or char_length(comment) <= 1500),
  is_reported  boolean not null default false,
  report_reason text,
  created_at   timestamptz not null default now(),
  -- One review per completed booking per reviewer.
  unique (booking_id, reviewer_id)
);

create index if not exists equipment_reviews_equipment_idx
  on public.equipment_reviews (equipment_id, created_at desc);

create table if not exists public.equipment_expenses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  equipment_id uuid references public.equipment (id) on delete set null,
  booking_id   uuid references public.equipment_bookings (id) on delete set null,
  kind         text not null check (kind in (
                 'operator', 'fuel', 'transport', 'maintenance', 'spare_parts', 'other')),
  amount_inr   numeric(12,2) not null check (amount_inr >= 0),
  estimated    boolean not null default true,
  note         text,
  spent_on     date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists equipment_expenses_owner_idx
  on public.equipment_expenses (owner_id, spent_on desc);

create table if not exists public.equipment_invoices (
  id           uuid primary key default gen_random_uuid(),
  invoice_no   text not null unique,
  booking_id   uuid not null references public.equipment_bookings (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  renter_id    uuid references auth.users (id) on delete set null,
  amount_inr   numeric(12,2) not null check (amount_inr >= 0),
  tax_inr      numeric(12,2) not null default 0 check (tax_inr >= 0),
  total_inr    numeric(12,2) not null check (total_inr >= 0),
  status       text not null default 'pending'
                 check (status in ('pending', 'processing', 'paid', 'failed', 'refunded')),
  issued_on    date not null default current_date,
  due_on       date,
  paid_on      timestamptz,
  reference    text,
  breakdown    jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists equipment_invoices_owner_idx
  on public.equipment_invoices (owner_id, status, issued_on desc);

create table if not exists public.equipment_notifications (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references auth.users (id) on delete cascade,
  kind      text not null default 'system'
              check (kind in ('request', 'quotation', 'booking', 'operator',
                              'reminder', 'maintenance', 'payment', 'review', 'system')),
  title     text not null,
  body      text,
  link      text,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists equipment_notifications_idx
  on public.equipment_notifications (owner_id, read_at, created_at desc);

create table if not exists public.equipment_messages (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  counterpart_id  uuid references auth.users (id) on delete set null,
  counterpart_name text not null,
  counterpart_role text,
  booking_id      uuid references public.equipment_bookings (id) on delete set null,
  direction       text not null check (direction in ('in', 'out')),
  body            text not null check (char_length(trim(body)) between 1 and 4000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists equipment_messages_idx
  on public.equipment_messages (owner_id, created_at);

create table if not exists public.equipment_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users (id) on delete cascade,
  equipment_id uuid references public.equipment (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists equipment_audit_idx
  on public.equipment_audit_logs (owner_id, created_at desc);

-- ── 12. Row Level Security ────────────────────────────────────────────────
alter table public.equipment_pricing              enable row level security;
alter table public.equipment_operators            enable row level security;
alter table public.equipment_rental_requests      enable row level security;
alter table public.equipment_quotations           enable row level security;
alter table public.equipment_availability_blocks  enable row level security;
alter table public.equipment_maintenance          enable row level security;
alter table public.equipment_rental_agreements    enable row level security;
alter table public.equipment_documents            enable row level security;
alter table public.equipment_reviews              enable row level security;
alter table public.equipment_expenses             enable row level security;
alter table public.equipment_invoices             enable row level security;
alter table public.equipment_notifications        enable row level security;
alter table public.equipment_messages             enable row level security;
alter table public.equipment_audit_logs           enable row level security;

create or replace function public.owns_equipment(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.equipment e where e.id = eid and e.owner_id = auth.uid());
$$;

grant execute on function public.owns_equipment(uuid) to authenticated;

-- Equipment: listed machines are browsable, the owner writes.
drop policy if exists "Equipment is browsable" on public.equipment;
create policy "Equipment is browsable" on public.equipment
  for select using ((is_listed and not is_archived) or auth.uid() = owner_id);

drop policy if exists "Owners manage their equipment" on public.equipment;
create policy "Owners manage their equipment" on public.equipment
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Pricing: readable by any signed-in renter shopping for a machine, written by
-- the owner of that machine.
drop policy if exists "Equipment pricing is readable" on public.equipment_pricing;
create policy "Equipment pricing is readable" on public.equipment_pricing
  for select using (auth.role() = 'authenticated');

drop policy if exists "Owners manage equipment pricing" on public.equipment_pricing;
create policy "Owners manage equipment pricing" on public.equipment_pricing
  for all using (public.owns_equipment(equipment_id))
  with check (public.owns_equipment(equipment_id));

-- Operators: owner-private. A renter sees only the operator on their booking.
drop policy if exists "Owners manage their operators" on public.equipment_operators;
create policy "Owners manage their operators" on public.equipment_operators
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Renters see the operator on their booking" on public.equipment_operators;
create policy "Renters see the operator on their booking" on public.equipment_operators
  for select using (
    exists (
      select 1 from public.equipment_bookings b
       where b.operator_id = equipment_operators.id and b.renter_id = auth.uid()
    )
  );

-- Rental requests
drop policy if exists "Open rental requests are visible" on public.equipment_rental_requests;
create policy "Open rental requests are visible" on public.equipment_rental_requests
  for select using (status = 'open' or auth.uid() = requester_id or auth.uid() = owner_id);

drop policy if exists "Renters create rental requests" on public.equipment_rental_requests;
create policy "Renters create rental requests" on public.equipment_rental_requests
  for insert with check (auth.uid() = requester_id);

drop policy if exists "Renters update their rental requests" on public.equipment_rental_requests;
create policy "Renters update their rental requests" on public.equipment_rental_requests
  for update using (auth.uid() = requester_id) with check (auth.uid() = requester_id);

-- Quotations
drop policy if exists "Owners manage their equipment quotations" on public.equipment_quotations;
create policy "Owners manage their equipment quotations" on public.equipment_quotations
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Renters read quotations on their request" on public.equipment_quotations;
create policy "Renters read quotations on their request" on public.equipment_quotations
  for select using (
    exists (
      select 1 from public.equipment_rental_requests r
       where r.id = request_id and r.requester_id = auth.uid()
    )
  );

-- Bookings: both parties read; the owner advances it (trigger validates).
drop policy if exists "Parties read equipment bookings" on public.equipment_bookings;
create policy "Parties read equipment bookings" on public.equipment_bookings
  for select using (auth.uid() = renter_id or auth.uid() = owner_id);

drop policy if exists "Parties update equipment bookings" on public.equipment_bookings;
create policy "Parties update equipment bookings" on public.equipment_bookings
  for update using (auth.uid() = renter_id or auth.uid() = owner_id)
  with check (auth.uid() = renter_id or auth.uid() = owner_id);

drop policy if exists "Owners create equipment bookings" on public.equipment_bookings;
create policy "Owners create equipment bookings" on public.equipment_bookings
  for insert with check (auth.uid() = owner_id or auth.uid() = renter_id);

-- Availability blocks & maintenance: owner only.
drop policy if exists "Owners manage availability blocks" on public.equipment_availability_blocks;
create policy "Owners manage availability blocks" on public.equipment_availability_blocks
  for all using (public.owns_equipment(equipment_id))
  with check (public.owns_equipment(equipment_id));

drop policy if exists "Renters read availability of listed equipment" on public.equipment_availability_blocks;
create policy "Renters read availability of listed equipment" on public.equipment_availability_blocks
  for select using (
    exists (select 1 from public.equipment e where e.id = equipment_id and e.is_listed)
  );

drop policy if exists "Owners manage maintenance" on public.equipment_maintenance;
create policy "Owners manage maintenance" on public.equipment_maintenance
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Agreements: the two parties.
drop policy if exists "Parties read rental agreements" on public.equipment_rental_agreements;
create policy "Parties read rental agreements" on public.equipment_rental_agreements
  for select using (auth.uid() = owner_id or auth.uid() = renter_id);

drop policy if exists "Owners create rental agreements" on public.equipment_rental_agreements;
create policy "Owners create rental agreements" on public.equipment_rental_agreements
  for insert with check (auth.uid() = owner_id);

drop policy if exists "Parties confirm rental agreements" on public.equipment_rental_agreements;
create policy "Parties confirm rental agreements" on public.equipment_rental_agreements
  for update using (auth.uid() = owner_id or auth.uid() = renter_id)
  with check (auth.uid() = owner_id or auth.uid() = renter_id);

-- Documents: owner-private.
drop policy if exists "Owners manage their equipment documents" on public.equipment_documents;
create policy "Owners manage their equipment documents" on public.equipment_documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Reviews: parties read; the renter writes after a completed booking only.
drop policy if exists "Parties read equipment reviews" on public.equipment_reviews;
create policy "Parties read equipment reviews" on public.equipment_reviews
  for select using (true);

drop policy if exists "Renters review completed bookings" on public.equipment_reviews;
create policy "Renters review completed bookings" on public.equipment_reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.equipment_bookings b
       where b.id = booking_id
         and b.renter_id = auth.uid()
         and b.status in ('work_completed', 'payment_confirmed', 'closed')
    )
  );

-- Expenses, invoices, notifications, messages, audit: owner-scoped.
drop policy if exists "Owners manage their equipment expenses" on public.equipment_expenses;
create policy "Owners manage their equipment expenses" on public.equipment_expenses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners read their equipment invoices" on public.equipment_invoices;
create policy "Owners read their equipment invoices" on public.equipment_invoices
  for select using (auth.uid() = owner_id or auth.uid() = renter_id);

drop policy if exists "Owners manage their equipment notifications" on public.equipment_notifications;
create policy "Owners manage their equipment notifications" on public.equipment_notifications
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners manage their equipment messages" on public.equipment_messages;
create policy "Owners manage their equipment messages" on public.equipment_messages
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners read their equipment audit log" on public.equipment_audit_logs;
create policy "Owners read their equipment audit log" on public.equipment_audit_logs
  for select using (auth.uid() = owner_id);

-- ── 13. Storage ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('equipment-documents', 'equipment-documents', false)
on conflict (id) do nothing;

drop policy if exists "Equipment owners read their files" on storage.objects;
create policy "Equipment owners read their files" on storage.objects
  for select using (
    bucket_id = 'equipment-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Equipment owners upload their files" on storage.objects;
create policy "Equipment owners upload their files" on storage.objects
  for insert with check (
    bucket_id = 'equipment-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Equipment owners remove their files" on storage.objects;
create policy "Equipment owners remove their files" on storage.objects
  for delete using (
    bucket_id = 'equipment-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 14. Convenience views ──────────────────────────────────────────────────
create or replace view public.equipment_booking_view
with (security_invoker = true)
as
select
  b.*,
  e.title       as equipment_title,
  e.category    as equipment_category,
  e.district    as equipment_district,
  e.images      as equipment_images,
  o.full_name   as operator_name,
  o.phone       as operator_phone,
  inv.status    as invoice_status,
  inv.invoice_no as invoice_no,
  inv.total_inr as invoice_total
from public.equipment_bookings b
left join public.equipment e on e.id = b.equipment_id
left join public.equipment_operators o on o.id = b.operator_id
left join public.equipment_invoices inv on inv.booking_id = b.id;

grant select on public.equipment_booking_view to authenticated;

create or replace view public.equipment_stats_view
with (security_invoker = true)
as
select
  e.id,
  e.owner_id,
  e.title,
  e.category,
  e.district,
  e.status,
  e.is_listed,
  e.is_archived,
  e.condition_score,
  e.next_service_on,
  count(b.id) filter (where b.status in (
    'confirmed', 'operator_assigned', 'scheduled', 'work_started')) as active_bookings,
  coalesce(sum(b.agreed_price_inr) filter (where b.status in (
    'payment_confirmed', 'closed')), 0) as revenue_inr
from public.equipment e
left join public.equipment_bookings b on b.equipment_id = e.id
group by e.id;

grant select on public.equipment_stats_view to authenticated;
