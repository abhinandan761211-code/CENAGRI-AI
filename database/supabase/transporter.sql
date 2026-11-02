-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Transporter module (agricultural logistics)
-- Run AFTER schema.sql, features.sql and worker.sql. Safe to re-run.
--
-- What this module is
--   A transporter moves produce and inputs from pickup to delivery for farmers,
--   buyers, retailers and warehouses. It is a full lifecycle: request → quote →
--   booking → trip → proof of delivery → payment → review.
--
-- Design decisions
--   • `vehicles` and `transport_requests` ALREADY EXIST in features.sql with no
--     rows and no writer. They are EXTENDED here (additive columns only) rather
--     than duplicated, so nothing that already references them breaks.
--   • The transporter is an ordinary CenAGRI account. What makes it a
--     transporter is that it owns a `transport_vehicles` row — there is no new
--     account type and no second user table.
--   • Money, delivery proof and trip status follow the same rule as the worker
--     module: a completed delivery and a paid invoice are backend/participant
--     written, and a transporter cannot mark itself paid.
--   • NO GPS table is populated by this file. `trip_locations` exists for a
--     future consented feed; until a driver opts in and a device reports, the UI
--     shows manual status only. Nothing invents a position.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Extend the existing tables (additive only) ──────────────────────────

-- `vehicles` gains the fleet fields a real transporter needs. Old rows (none
-- exist today) simply get nulls, so the constraint stays permissive.
alter table public.vehicles
  add column if not exists registration_no text,
  add column if not exists vehicle_type text,
  add column if not exists make_model text,
  add column if not exists manufacture_year integer,
  add column if not exists length_ft numeric(6,2),
  add column if not exists width_ft numeric(6,2),
  add column if not exists height_ft numeric(6,2),
  add column if not exists fuel_type text,
  add column if not exists insurance_valid_till date,
  add column if not exists fitness_valid_till date,
  add column if not exists permit_no text,
  add column if not exists permit_valid_till date,
  add column if not exists rc_document_url text,
  add column if not exists photo_url text,
  add column if not exists odometer_km integer,
  add column if not exists last_service_on date,
  add column if not exists next_service_on date,
  add column if not exists notes text,
  add column if not exists is_archived boolean not null default false;

do $$
begin
  alter table public.vehicles drop constraint if exists vehicles_vehicle_type_check;
  alter table public.vehicles
    add constraint vehicles_vehicle_type_check
    check (vehicle_type is null or vehicle_type in (
      'Tractor Trolley', 'Pickup', 'Mini Truck', 'Light Commercial Vehicle',
      'Heavy Truck', 'Refrigerated Truck', 'Other'));
exception when others then null;
end $$;

do $$
begin
  alter table public.vehicles drop constraint if exists vehicles_fuel_check;
  alter table public.vehicles
    add constraint vehicles_fuel_check
    check (fuel_type is null or fuel_type in ('Diesel', 'Petrol', 'CNG', 'Electric', 'Other'));
exception when others then null;
end $$;

do $$
begin
  alter table public.vehicles drop constraint if exists vehicles_year_check;
  alter table public.vehicles
    add constraint vehicles_year_check
    check (manufacture_year is null or manufacture_year between 1980 and 2100);
exception when others then null;
end $$;

create index if not exists vehicles_owner_idx on public.vehicles (owner_id, is_archived);
create unique index if not exists vehicles_registration_uniq
  on public.vehicles (upper(registration_no))
  where registration_no is not null;

-- `transport_requests` gains cargo, price and vehicle requirements.
alter table public.transport_requests
  add column if not exists title text,
  add column if not exists cargo_type text,
  add column if not exists commodity text,
  add column if not exists quantity text,
  add column if not exists weight_kg numeric(12,2),
  add column if not exists pickup_district text,
  add column if not exists pickup_state text,
  add column if not exists pickup_lat numeric(9,6),
  add column if not exists pickup_lng numeric(9,6),
  add column if not exists dropoff_district text,
  add column if not exists dropoff_state text,
  add column if not exists dropoff_lat numeric(9,6),
  add column if not exists dropoff_lng numeric(9,6),
  add column if not exists distance_km numeric(8,2),
  add column if not exists vehicle_type text,
  add column if not exists min_capacity_kg numeric(12,2),
  add column if not exists pickup_on date,
  add column if not exists pickup_time time,
  add column if not exists needs_loading_help boolean not null default false,
  add column if not exists needs_unloading_help boolean not null default false,
  add column if not exists price_type text not null default 'offer'
    check (price_type in ('fixed', 'offer')),
  add column if not exists offered_price_inr numeric(12,2)
    check (offered_price_inr is null or offered_price_inr >= 0),
  add column if not exists expires_on date,
  add column if not exists requester_name text,
  add column if not exists requester_role text,
  add column if not exists requester_verified boolean not null default false,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.transport_requests drop constraint if exists transport_requests_cargo_check;
  alter table public.transport_requests
    add constraint transport_requests_cargo_check
    check (cargo_type is null or cargo_type in (
      'Produce', 'Seeds & Fertiliser', 'Machinery', 'Livestock', 'Cold Chain', 'Other'));
exception when others then null;
end $$;

create index if not exists transport_requests_status_idx
  on public.transport_requests (status, pickup_on);
create index if not exists transport_requests_requester_idx
  on public.transport_requests (requester_id, created_at desc);
create index if not exists transport_requests_pickup_idx
  on public.transport_requests (pickup_district, status);

drop trigger if exists trg_transport_requests_updated_at on public.transport_requests;
create trigger trg_transport_requests_updated_at
  before update on public.transport_requests
  for each row execute function public.touch_updated_at();

-- ── 2. Transporter profile ─────────────────────────────────────────────────
create table if not exists public.transporter_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  business_name     text,
  about             text check (about is null or char_length(about) <= 2000),
  service_districts text[] not null default '{}'::text[],
  service_categories text[] not null default '{}'::text[],
  experience_years  integer not null default 0 check (experience_years between 0 and 60),
  contact_phone     text,
  operating_since   integer,
  verification      text not null default 'not_submitted'
                      check (verification in ('not_submitted', 'pending', 'verified', 'rejected')),
  verified_at       timestamptz,
  rating_avg        numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count      integer not null default 0 check (rating_count >= 0),
  trips_completed   integer not null default 0 check (trips_completed >= 0),
  is_accepting      boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_transporter_profiles_updated_at on public.transporter_profiles;
create trigger trg_transporter_profiles_updated_at
  before update on public.transporter_profiles
  for each row execute function public.touch_updated_at();

-- ── 3. Drivers ─────────────────────────────────────────────────────────────
-- Licence number is stored but the DOCUMENT lives in a private bucket and is
-- never returned to anyone but the owner and an authorised reviewer.
create table if not exists public.transporter_drivers (
  id             uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references auth.users (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  full_name      text not null check (char_length(trim(full_name)) between 2 and 120),
  phone          text,
  licence_no     text,
  licence_expiry date,
  licence_document_url text,
  experience_years integer not null default 0 check (experience_years between 0 and 60),
  assigned_vehicle_id uuid references public.vehicles (id) on delete set null,
  status         text not null default 'available'
                   check (status in ('available', 'on_trip', 'leave', 'inactive')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists drivers_transporter_idx
  on public.transporter_drivers (transporter_id, status);
create unique index if not exists drivers_licence_uniq
  on public.transporter_drivers (transporter_id, upper(licence_no))
  where licence_no is not null;

drop trigger if exists trg_transporter_drivers_updated_at on public.transporter_drivers;
create trigger trg_transporter_drivers_updated_at
  before update on public.transporter_drivers
  for each row execute function public.touch_updated_at();

-- ── 4. Offers (a transporter's quote on a request) ─────────────────────────
create table if not exists public.transport_offers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.transport_requests (id) on delete cascade,
  transporter_id uuid not null references auth.users (id) on delete cascade,
  price_inr      numeric(12,2) not null check (price_inr >= 0),
  vehicle_id     uuid references public.vehicles (id) on delete set null,
  driver_id      uuid references public.transporter_drivers (id) on delete set null,
  eta_hours      numeric(6,2) check (eta_hours is null or eta_hours >= 0),
  message        text check (message is null or char_length(message) <= 1000),
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One live offer per transporter per request. This is the database half of
  -- "prevent duplicate active offers".
  unique (request_id, transporter_id)
);

create index if not exists transport_offers_transporter_idx
  on public.transport_offers (transporter_id, status, created_at desc);
create index if not exists transport_offers_request_idx
  on public.transport_offers (request_id, status);

drop trigger if exists trg_transport_offers_updated_at on public.transport_offers;
create trigger trg_transport_offers_updated_at
  before update on public.transport_offers
  for each row execute function public.touch_updated_at();

-- ── 5. Bookings ────────────────────────────────────────────────────────────
create table if not exists public.transport_bookings (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid references public.transport_requests (id) on delete set null,
  offer_id       uuid references public.transport_offers (id) on delete set null,
  transporter_id uuid not null references auth.users (id) on delete cascade,
  requester_id   uuid not null references auth.users (id) on delete cascade,
  requester_name text,
  requester_role text,
  title          text not null,
  cargo_type     text,
  commodity      text,
  weight_kg      numeric(12,2),
  pickup         text not null,
  dropoff        text not null,
  pickup_district text,
  dropoff_district text,
  distance_km    numeric(8,2),
  agreed_price_inr numeric(12,2) not null check (agreed_price_inr >= 0),
  vehicle_id     uuid references public.vehicles (id) on delete set null,
  driver_id      uuid references public.transporter_drivers (id) on delete set null,
  -- Lifecycle. Transitions are validated by the trigger in section 9.
  status         text not null default 'accepted'
                   check (status in (
                     'requested', 'quotation_submitted', 'accepted', 'confirmed',
                     'vehicle_assigned', 'driver_assigned', 'pickup_scheduled',
                     'picked_up', 'in_transit', 'delivered', 'completed',
                     'cancelled', 'disputed')),
  pickup_on      date,
  pickup_time    time,
  expected_delivery_at timestamptz,
  actual_delivery_at   timestamptz,
  cancel_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (request_id)
);

create index if not exists transport_bookings_transporter_idx
  on public.transport_bookings (transporter_id, status, created_at desc);
create index if not exists transport_bookings_requester_idx
  on public.transport_bookings (requester_id, created_at desc);
create index if not exists transport_bookings_status_idx
  on public.transport_bookings (status, pickup_on);

drop trigger if exists trg_transport_bookings_updated_at on public.transport_bookings;
create trigger trg_transport_bookings_updated_at
  before update on public.transport_bookings
  for each row execute function public.touch_updated_at();

-- ── 6. Trip events (the audit trail of status changes) ─────────────────────
create table if not exists public.trip_events (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.transport_bookings (id) on delete cascade,
  type        text not null check (type in (
                'status', 'note', 'document', 'location', 'delay')),
  from_status text,
  to_status   text,
  note        text,
  actor_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists trip_events_booking_idx on public.trip_events (booking_id, created_at);

-- ── 7. Trip locations (consented GPS feed) ─────────────────────────────────
-- Deliberately empty by default. A row is only written when a driver consents
-- and the device reports; the UI must never synthesise a position.
create table if not exists public.trip_locations (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.transport_bookings (id) on delete cascade,
  lat         numeric(9,6) not null check (lat between -90 and 90),
  lng         numeric(9,6) not null check (lng between -180 and 180),
  speed_kmph  numeric(6,2),
  accuracy_m  numeric(8,2),
  recorded_at timestamptz not null default now(),
  reported_by uuid references auth.users (id) on delete set null
);

create index if not exists trip_locations_booking_idx
  on public.trip_locations (booking_id, recorded_at desc);

-- ── 8. Proof of delivery ───────────────────────────────────────────────────
create table if not exists public.delivery_proofs (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.transport_bookings (id) on delete cascade,
  receiver_name   text not null check (char_length(trim(receiver_name)) between 2 and 120),
  receiver_phone  text,
  received_qty    text,
  damage_notes    text,
  notes           text,
  photo_url       text,
  -- The OTP is stored hashed by the backend; this column keeps the hash only.
  otp_hash        text,
  otp_verified_at timestamptz,
  delivered_at    timestamptz not null default now(),
  recorded_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ── 9. Booking status transitions ──────────────────────────────────────────
-- A completed or cancelled booking can never be reopened: the trigger rejects
-- any move out of a terminal state. That is stronger than a UI guard because it
-- holds for every client.
create or replace function public.transport_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  -- Terminal states are final.
  if old.status in ('completed', 'cancelled') then
    raise exception 'Booking % is % and cannot be reopened', old.id, old.status
      using errcode = 'check_violation';
  end if;

  allowed := case old.status
    when 'requested'            then array['quotation_submitted', 'accepted', 'confirmed', 'cancelled']
    when 'quotation_submitted'  then array['accepted', 'confirmed', 'cancelled']
    when 'accepted'             then array['confirmed', 'vehicle_assigned', 'cancelled']
    when 'confirmed'            then array['vehicle_assigned', 'cancelled']
    when 'vehicle_assigned'     then array['driver_assigned', 'cancelled']
    when 'driver_assigned'      then array['pickup_scheduled', 'cancelled']
    when 'pickup_scheduled'     then array['picked_up', 'cancelled']
    when 'picked_up'            then array['in_transit', 'delivered', 'disputed']
    when 'in_transit'           then array['delivered', 'disputed']
    when 'delivered'            then array['completed', 'disputed']
    when 'disputed'             then array['delivered', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'Cannot move booking from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Stamp the delivery time once, from the database clock.
  if new.status = 'delivered' and new.actual_delivery_at is null then
    new.actual_delivery_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transport_booking_transition on public.transport_bookings;
create trigger trg_transport_booking_transition
  before update of status on public.transport_bookings
  for each row execute function public.transport_booking_transition();

-- Every status change is recorded, so the history is never lost.
create or replace function public.transport_booking_log_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.trip_events (booking_id, type, from_status, to_status, actor_id)
    values (new.id, 'status', old.status, new.status, auth.uid());

    if new.status = 'completed' then
      update public.transporter_profiles
         set trips_completed = trips_completed + 1
       where user_id = new.transporter_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transport_booking_log_event on public.transport_bookings;
create trigger trg_transport_booking_log_event
  after update of status on public.transport_bookings
  for each row execute function public.transport_booking_log_event();

-- When an offer is accepted, the booking is created in one transaction and the
-- request is closed to other transporters.
create or replace function public.transport_accept_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.transport_requests;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;

  select * into req from public.transport_requests where id = new.request_id;
  if req is null then
    return new;
  end if;

  insert into public.transport_bookings (
    request_id, offer_id, transporter_id, requester_id, requester_name,
    requester_role, title, cargo_type, commodity, weight_kg, pickup, dropoff,
    pickup_district, dropoff_district, distance_km, agreed_price_inr,
    vehicle_id, driver_id, status, pickup_on, pickup_time
  ) values (
    req.id, new.id, new.transporter_id, req.requester_id, req.requester_name,
    req.requester_role, coalesce(req.title, 'Transport job'), req.cargo_type,
    req.commodity, coalesce(req.weight_kg, req.load_kg), req.pickup, req.dropoff,
    req.pickup_district, req.dropoff_district, req.distance_km, new.price_inr,
    new.vehicle_id, new.driver_id,
    case when new.vehicle_id is not null then 'vehicle_assigned' else 'confirmed' end,
    req.pickup_on, req.pickup_time
  )
  on conflict (request_id) do nothing;

  update public.transport_requests set status = 'assigned' where id = req.id;

  update public.transport_offers
     set status = 'rejected'
   where request_id = req.id and id <> new.id and status = 'pending';

  insert into public.transporter_notifications (transporter_id, kind, title, body, link)
  values (
    new.transporter_id, 'booking', 'Offer accepted',
    'Your quote for "' || coalesce(req.title, 'a transport job') || '" was accepted.',
    '/transporter/bookings'
  );

  return new;
end;
$$;

drop trigger if exists trg_transport_accept_offer on public.transport_offers;
create trigger trg_transport_accept_offer
  after update of status on public.transport_offers
  for each row execute function public.transport_accept_offer();

-- ── 10. Expenses ───────────────────────────────────────────────────────────
-- `estimated` distinguishes the transporter's own guess from a verified cost
-- (e.g. a fuel receipt entered by the owner). The UI labels them differently.
create table if not exists public.trip_expenses (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.transport_bookings (id) on delete cascade,
  transporter_id uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in (
                'fuel', 'toll', 'loading', 'unloading', 'driver', 'maintenance', 'other')),
  amount_inr  numeric(12,2) not null check (amount_inr >= 0),
  estimated   boolean not null default true,
  receipt_url text,
  note        text,
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists trip_expenses_booking_idx on public.trip_expenses (booking_id);
create index if not exists trip_expenses_transporter_idx
  on public.trip_expenses (transporter_id, spent_on desc);

-- ── 11. Invoices & earnings ────────────────────────────────────────────────
create table if not exists public.transport_invoices (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.transport_bookings (id) on delete cascade,
  transporter_id uuid not null references auth.users (id) on delete cascade,
  requester_id  uuid references auth.users (id) on delete set null,
  invoice_no    text not null unique,
  amount_inr    numeric(12,2) not null check (amount_inr >= 0),
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'paid', 'failed', 'refunded')),
  issued_on     date not null default current_date,
  due_on        date,
  paid_on       timestamptz,
  reference     text,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists transport_invoices_transporter_idx
  on public.transport_invoices (transporter_id, status, issued_on desc);
create index if not exists transport_invoices_booking_idx on public.transport_invoices (booking_id);

-- ── 12. Reviews ────────────────────────────────────────────────────────────
create table if not exists public.transport_reviews (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.transport_bookings (id) on delete cascade,
  transporter_id uuid not null references auth.users (id) on delete cascade,
  reviewer_id   uuid not null references auth.users (id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('requester', 'transporter')),
  rating        integer not null check (rating between 1 and 5),
  comment       text check (comment is null or char_length(comment) <= 1500),
  is_reported   boolean not null default false,
  report_reason text,
  created_at    timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);

create index if not exists transport_reviews_transporter_idx
  on public.transport_reviews (transporter_id, created_at desc);

create or replace function public.transporter_sync_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.transporter_id, old.transporter_id);
  update public.transporter_profiles tp
     set rating_count = coalesce(stats.cnt, 0),
         rating_avg   = coalesce(stats.avg, 0),
         updated_at   = now()
    from (
      select count(*)::int as cnt, round(avg(rating)::numeric, 2) as avg
        from public.transport_reviews
       where transporter_id = target
    ) stats
   where tp.user_id = target;
  return null;
end;
$$;

drop trigger if exists trg_transporter_review_rating on public.transport_reviews;
create trigger trg_transporter_review_rating
  after insert or update or delete on public.transport_reviews
  for each row execute function public.transporter_sync_rating();

-- ── 13. Notifications, availability, messages, documents ──────────────────
create table if not exists public.transporter_notifications (
  id            uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references auth.users (id) on delete cascade,
  kind          text not null default 'system'
                  check (kind in ('request', 'offer', 'booking', 'trip', 'payment', 'review', 'system')),
  title         text not null,
  body          text,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists transporter_notifications_idx
  on public.transporter_notifications (transporter_id, read_at, created_at desc);

create table if not exists public.transporter_availability (
  id             uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references auth.users (id) on delete cascade,
  day            date not null,
  available      boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  unique (transporter_id, day)
);

create table if not exists public.transporter_messages (
  id             uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references auth.users (id) on delete cascade,
  counterpart_id uuid references auth.users (id) on delete set null,
  counterpart_name text not null,
  counterpart_role text,
  booking_id     uuid references public.transport_bookings (id) on delete set null,
  direction      text not null check (direction in ('in', 'out')),
  body           text not null check (char_length(trim(body)) between 1 and 4000),
  attachment_url text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists transporter_messages_idx
  on public.transporter_messages (transporter_id, created_at);

create table if not exists public.transporter_documents (
  id             uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in (
                   'business_registration', 'vehicle_rc', 'insurance',
                   'fitness', 'permit', 'driver_licence', 'other')),
  document_url   text not null,
  vehicle_id     uuid references public.vehicles (id) on delete set null,
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists transporter_documents_idx
  on public.transporter_documents (transporter_id, kind);

create table if not exists public.transport_reports (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid references public.transport_bookings (id) on delete cascade,
  reporter_id    uuid not null references auth.users (id) on delete cascade,
  reason         text not null check (reason in (
                   'fake_request', 'wrong_pay', 'unsafe', 'damaged_cargo', 'harassment', 'other')),
  details        text check (details is null or char_length(details) <= 1000),
  status         text not null default 'open'
                   check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at     timestamptz not null default now()
);

-- ── 14. Row Level Security ─────────────────────────────────────────────────
-- Every table is scoped to the signed-in account. `auth.uid()` is the only
-- identity trusted; a transporter_id or requester_id sent by the browser is
-- never used for authorisation.

alter table public.transporter_profiles      enable row level security;
alter table public.transporter_drivers       enable row level security;
alter table public.transport_offers          enable row level security;
alter table public.transport_bookings        enable row level security;
alter table public.trip_events               enable row level security;
alter table public.trip_locations            enable row level security;
alter table public.delivery_proofs           enable row level security;
alter table public.trip_expenses             enable row level security;
alter table public.transport_invoices        enable row level security;
alter table public.transport_reviews         enable row level security;
alter table public.transporter_notifications enable row level security;
alter table public.transporter_availability  enable row level security;
alter table public.transporter_messages      enable row level security;
alter table public.transporter_documents     enable row level security;
alter table public.transport_reports         enable row level security;

-- vehicles: owner only for writes; an open booking shows the assigned vehicle.
drop policy if exists "Owners manage their vehicles" on public.vehicles;
create policy "Owners manage their vehicles" on public.vehicles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- transport_requests: any signed-in transporter may browse open requests; the
-- requester owns their own. Writes belong to the requester alone.
drop policy if exists "Open transport requests are visible" on public.transport_requests;
create policy "Open transport requests are visible" on public.transport_requests
  for select using (status = 'open' or auth.uid() = requester_id);

drop policy if exists "Requesters manage their requests" on public.transport_requests;
create policy "Requesters manage their requests" on public.transport_requests
  for insert with check (auth.uid() = requester_id);

drop policy if exists "Requesters update their requests" on public.transport_requests;
create policy "Requesters update their requests" on public.transport_requests
  for update using (auth.uid() = requester_id) with check (auth.uid() = requester_id);

-- transporter profile: owner writes; a requester may read the profile of a
-- transporter they have a booking with (they need a name and rating).
drop policy if exists "Transporters manage their profile" on public.transporter_profiles;
create policy "Transporters manage their profile" on public.transporter_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Requesters see their transporter" on public.transporter_profiles;
create policy "Requesters see their transporter" on public.transporter_profiles
  for select using (
    exists (
      select 1 from public.transport_bookings b
       where b.transporter_id = transporter_profiles.user_id
         and b.requester_id = auth.uid()
    )
  );

drop policy if exists "Transporters manage their drivers" on public.transporter_drivers;
create policy "Transporters manage their drivers" on public.transporter_drivers
  for all using (auth.uid() = transporter_id) with check (auth.uid() = transporter_id);

drop policy if exists "Transporters manage their offers" on public.transport_offers;
create policy "Transporters manage their offers" on public.transport_offers
  for all using (
    auth.uid() = transporter_id
    or exists (
      select 1 from public.transport_requests r
       where r.id = request_id and r.requester_id = auth.uid()
    )
  )
  with check (auth.uid() = transporter_id);

-- Bookings: both parties read; each side may update (the trigger decides which
-- transitions are legal, so a rogue client cannot jump to 'completed').
drop policy if exists "Parties read their bookings" on public.transport_bookings;
create policy "Parties read their bookings" on public.transport_bookings
  for select using (auth.uid() = transporter_id or auth.uid() = requester_id);

drop policy if exists "Parties update their bookings" on public.transport_bookings;
create policy "Parties update their bookings" on public.transport_bookings
  for update using (auth.uid() = transporter_id or auth.uid() = requester_id)
  with check (auth.uid() = transporter_id or auth.uid() = requester_id);

drop policy if exists "Offers create bookings" on public.transport_bookings;
create policy "Offers create bookings" on public.transport_bookings
  for insert with check (auth.uid() = transporter_id);

drop policy if exists "Parties read trip events" on public.trip_events;
create policy "Parties read trip events" on public.trip_events
  for select using (
    exists (
      select 1 from public.transport_bookings b
       where b.id = booking_id
         and (b.transporter_id = auth.uid() or b.requester_id = auth.uid())
    )
  );

-- GPS: readable by the two parties; writable only by the transporter (i.e. the
-- device that is actually on the trip). No row is created by the app itself.
drop policy if exists "Parties read trip locations" on public.trip_locations;
create policy "Parties read trip locations" on public.trip_locations
  for select using (
    exists (
      select 1 from public.transport_bookings b
       where b.id = booking_id
         and (b.transporter_id = auth.uid() or b.requester_id = auth.uid())
    )
  );

drop policy if exists "Transporter reports trip locations" on public.trip_locations;
create policy "Transporter reports trip locations" on public.trip_locations
  for insert with check (
    exists (
      select 1 from public.transport_bookings b
       where b.id = booking_id and b.transporter_id = auth.uid()
    )
  );

-- Proof of delivery: both parties read; the transporter records it.
drop policy if exists "Parties read delivery proofs" on public.delivery_proofs;
create policy "Parties read delivery proofs" on public.delivery_proofs
  for select using (
    exists (
      select 1 from public.transport_bookings b
       where b.id = booking_id
         and (b.transporter_id = auth.uid() or b.requester_id = auth.uid())
    )
  );

drop policy if exists "Transporter records delivery proof" on public.delivery_proofs;
create policy "Transporter records delivery proof" on public.delivery_proofs
  for insert with check (
    exists (
      select 1 from public.transport_bookings b
       where b.id = booking_id and b.transporter_id = auth.uid()
    )
  );

drop policy if exists "Transporters manage their expenses" on public.trip_expenses;
create policy "Transporters manage their expenses" on public.trip_expenses
  for all using (auth.uid() = transporter_id) with check (auth.uid() = transporter_id);

-- Invoices: the transporter may READ their own. Creating and marking paid is
-- backend-only, which is why a transporter cannot fake a payment.
drop policy if exists "Transporters read their invoices" on public.transport_invoices;
create policy "Transporters read their invoices" on public.transport_invoices
  for select using (auth.uid() = transporter_id or auth.uid() = requester_id);

drop policy if exists "Parties read transport reviews" on public.transport_reviews;
create policy "Parties read transport reviews" on public.transport_reviews
  for select using (auth.uid() = transporter_id or auth.uid() = reviewer_id);

drop policy if exists "Eligible parties review a completed trip" on public.transport_reviews;
create policy "Eligible parties review a completed trip" on public.transport_reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.transport_bookings b
       where b.id = booking_id
         and b.status = 'completed'
         and (b.transporter_id = auth.uid() or b.requester_id = auth.uid())
    )
  );

drop policy if exists "Transporters manage their notifications" on public.transporter_notifications;
create policy "Transporters manage their notifications" on public.transporter_notifications
  for all using (auth.uid() = transporter_id) with check (auth.uid() = transporter_id);

drop policy if exists "Transporters manage their availability" on public.transporter_availability;
create policy "Transporters manage their availability" on public.transporter_availability
  for all using (auth.uid() = transporter_id) with check (auth.uid() = transporter_id);

drop policy if exists "Transporters manage their messages" on public.transporter_messages;
create policy "Transporters manage their messages" on public.transporter_messages
  for all using (auth.uid() = transporter_id) with check (auth.uid() = transporter_id);

drop policy if exists "Transporters manage their documents" on public.transporter_documents;
create policy "Transporters manage their documents" on public.transporter_documents
  for all using (auth.uid() = transporter_id) with check (auth.uid() = transporter_id);

drop policy if exists "Users file their own transport reports" on public.transport_reports;
create policy "Users file their own transport reports" on public.transport_reports
  for all using (auth.uid() = reporter_id) with check (auth.uid() = reporter_id);

-- ── 15. Storage ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('transporter-documents', 'transporter-documents', false),
  ('transporter-vehicles', 'transporter-vehicles', false),
  ('transport-delivery-proofs', 'transport-delivery-proofs', false)
on conflict (id) do nothing;

drop policy if exists "Transporters read their own documents" on storage.objects;
create policy "Transporters read their own documents" on storage.objects
  for select using (
    bucket_id in ('transporter-documents', 'transporter-vehicles')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Transporters upload their own documents" on storage.objects;
create policy "Transporters upload their own documents" on storage.objects
  for insert with check (
    bucket_id in ('transporter-documents', 'transporter-vehicles', 'transport-delivery-proofs')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Transporters remove their own documents" on storage.objects;
create policy "Transporters remove their own documents" on storage.objects
  for delete using (
    bucket_id in ('transporter-documents', 'transporter-vehicles')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 16. Convenience views ──────────────────────────────────────────────────
-- `security_invoker` keeps RLS in force for whoever queries the view.
create or replace view public.transporter_booking_view
with (security_invoker = true)
as
select
  b.*,
  v.registration_no as vehicle_registration,
  v.vehicle_type    as vehicle_type,
  v.capacity_kg     as vehicle_capacity_kg,
  d.full_name       as driver_name,
  d.phone           as driver_phone,
  d.licence_no      as driver_licence,
  -- `delivery_proofs` has no status column: a row existing *is* the proof.
  case
    when p.id is null then null
    when p.otp_verified_at is not null then 'verified'
    else 'recorded'
  end               as proof_status,
  p.receiver_name   as proof_receiver,
  p.delivered_at    as proof_delivered_at,
  i.status          as invoice_status,
  i.invoice_no      as invoice_no,
  i.amount_inr      as invoice_amount
from public.transport_bookings b
left join public.vehicles v on v.id = b.vehicle_id
left join public.transporter_drivers d on d.id = b.driver_id
left join public.delivery_proofs p on p.booking_id = b.id
left join public.transport_invoices i on i.booking_id = b.id;

grant select on public.transporter_booking_view to authenticated;

create or replace view public.transporter_fleet_stats
with (security_invoker = true)
as
select
  v.id,
  v.owner_id,
  v.registration_no,
  v.vehicle_type,
  v.make_model,
  v.capacity_kg,
  v.available,
  v.is_archived,
  v.insurance_valid_till,
  v.fitness_valid_till,
  v.permit_valid_till,
  v.next_service_on,
  count(b.id) filter (where b.status in (
    'pickup_scheduled', 'picked_up', 'in_transit')) as active_trips
from public.vehicles v
left join public.transport_bookings b on b.vehicle_id = v.id
group by v.id;

grant select on public.transporter_fleet_stats to authenticated;
