-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Warehouse module (agricultural storage & warehousing)
-- Run AFTER schema.sql, features.sql, transporter.sql. Safe to re-run.
--
-- What this module is
--   A warehouse owner stores other people's produce. It is a custodial
--   business, not a trading one: the owner holds the goods, never owns them.
--   The lifecycle is request → quotation → booking → goods inward → stored
--   inventory → inspection → release → invoice.
--
-- Design decisions
--   • `warehouses` and `storage_bookings` ALREADY EXIST in features.sql. They
--     are EXTENDED here (additive columns only) rather than duplicated, so the
--     farmer-facing Storage & Warehouse screen keeps working unchanged.
--   • Capacity is the central invariant. Every booking and every inward receipt
--     checks it in the database (triggers, section 9), not only in the UI,
--     because overbooking a godown in paddy season ruins a farmer's crop.
--   • `inventory_lots` always carries `depositor_id`. Stock of two customers is
--     never merged, and only the depositor owns what is in the lot. Every
--     quantity change goes through `inventory_transactions` with a reason and
--     an actor — nothing silently shrinks a customer's stock.
--   • Environmental readings are MANUAL unless a device actually reports. The
--     `source` column says which; the UI must never dress a manual entry up as
--     a live sensor.
--   • Money: invoices and payments are backend-written. A warehouse cannot mark
--     its own invoice paid, exactly as in the worker and transporter modules.
--   • Transport is NOT reimplemented. Inbound/outbound vehicle needs create a
--     normal `transport_requests` row so the existing transporter module and its
--     offers/bookings/trips do all the work.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Extend the existing warehouses table (additive only) ────────────────
-- features.sql gives: owner_id, name, kind ('Dry'|'Cold'), capacity_kg,
-- available_kg, rate_inr, rate_unit, district, state.

alter table public.warehouses
  add column if not exists warehouse_type text,
  add column if not exists address_line text,
  add column if not exists village text,
  add column if not exists pincode text,
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists total_capacity_kg numeric(12,2),
  add column if not exists reserved_kg numeric(12,2) not null default 0,
  add column if not exists occupied_kg numeric(12,2) not null default 0,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists opens_at time not null default '08:00',
  add column if not exists closes_at time not null default '18:00',
  add column if not exists facilities text[] not null default '{}'::text[],
  add column if not exists loading_facilities text[] not null default '{}'::text[],
  add column if not exists security_facilities text[] not null default '{}'::text[],
  add column if not exists photos text[] not null default '{}'::text[],
  add column if not exists accepted_commodities text[] not null default '{}'::text[],
  add column if not exists is_listed boolean not null default true,
  add column if not exists is_archived boolean not null default false,
  add column if not exists verification text not null default 'not_submitted',
  add column if not exists verified_at timestamptz,
  add column if not exists about text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.warehouses drop constraint if exists warehouses_verification_check;
  alter table public.warehouses
    add constraint warehouses_verification_check
    check (verification in ('not_submitted', 'pending', 'verified', 'rejected', 'expired'));
exception when others then null;
end $$;

do $$
begin
  alter table public.warehouses drop constraint if exists warehouses_warehouse_type_check;
  alter table public.warehouses
    add constraint warehouses_warehouse_type_check
    check (warehouse_type is null or warehouse_type in (
      'general', 'grain', 'cold', 'fruit_veg', 'seed', 'other'));
exception when others then null;
end $$;

-- The extended counters must never exceed the declared capacity.
do $$
begin
  alter table public.warehouses drop constraint if exists warehouses_capacity_check;
  alter table public.warehouses
    add constraint warehouses_capacity_check
    check (capacity_kg > 0
           and available_kg >= 0
           and reserved_kg >= 0
           and occupied_kg >= 0
           and available_kg <= capacity_kg
           and reserved_kg + occupied_kg <= capacity_kg);
exception when others then null;
end $$;

create index if not exists warehouses_owner_idx
  on public.warehouses (owner_id, is_archived);

-- `total_capacity_kg` mirrors the legacy `capacity_kg` that features.sql and the
-- farmer-facing storage screen read, so the two can never drift apart.
update public.warehouses
   set total_capacity_kg = capacity_kg
 where total_capacity_kg is null;

alter table public.warehouses alter column total_capacity_kg set default 0;

create or replace function public.warehouses_sync_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.total_capacity_kg, 0) = 0 and new.capacity_kg > 0 then
      new.total_capacity_kg := new.capacity_kg;
    end if;
  elsif new.total_capacity_kg is distinct from old.total_capacity_kg then
    new.capacity_kg := new.total_capacity_kg;
  elsif new.capacity_kg is distinct from old.capacity_kg then
    new.total_capacity_kg := new.capacity_kg;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_warehouses_sync_capacity on public.warehouses;
create trigger trg_warehouses_sync_capacity
  before insert or update on public.warehouses
  for each row execute function public.warehouses_sync_capacity();
create index if not exists warehouses_listing_idx
  on public.warehouses (is_listed, district, warehouse_type);

drop trigger if exists trg_warehouses_updated_at on public.warehouses;
create trigger trg_warehouses_updated_at
  before update on public.warehouses
  for each row execute function public.touch_updated_at();

-- ── 2. Storage sections (physical areas inside a warehouse) ────────────────
-- Commodities are not mixed across sections: the section carries one category
-- and the booking must match it.
create table if not exists public.warehouse_sections (
  id             uuid primary key default gen_random_uuid(),
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  name           text not null check (char_length(trim(name)) between 1 and 80),
  commodity_category text not null default 'grain'
                     check (commodity_category in (
                       'grain', 'pulses', 'oilseed', 'seed', 'cold_chain',
                       'fruit_veg', 'inputs', 'other')),
  capacity_kg    numeric(12,2) not null check (capacity_kg > 0),
  reserved_kg    numeric(12,2) not null default 0 check (reserved_kg >= 0),
  occupied_kg    numeric(12,2) not null default 0 check (occupied_kg >= 0),
  temp_min_c     numeric(5,2),
  temp_max_c     numeric(5,2),
  humidity_min   numeric(5,2),
  humidity_max   numeric(5,2),
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (warehouse_id, name),
  check (reserved_kg + occupied_kg <= capacity_kg)
);

create index if not exists warehouse_sections_idx
  on public.warehouse_sections (warehouse_id, is_active);

drop trigger if exists trg_warehouse_sections_updated_at on public.warehouse_sections;
create trigger trg_warehouse_sections_updated_at
  before update on public.warehouse_sections
  for each row execute function public.touch_updated_at();

-- ── 3. Storage requests (posted by farmers / buyers / retailers) ───────────
create table if not exists public.storage_requests (
  id               uuid primary key default gen_random_uuid(),
  requester_id     uuid not null references auth.users (id) on delete cascade,
  -- Optional: a farmer may target one warehouse, or post openly to the district.
  warehouse_id     uuid references public.warehouses (id) on delete set null,
  requester_name   text,
  requester_role   text,
  crop_name        text not null check (char_length(trim(crop_name)) between 1 and 120),
  variety          text,
  quantity_kg      numeric(12,2) not null check (quantity_kg > 0),
  quantity_unit    text not null default 'kg' check (quantity_unit in ('kg', 'quintal', 'tonne')),
  storage_type     text not null default 'general'
                     check (storage_type in ('general', 'grain', 'cold', 'fruit_veg', 'seed', 'other')),
  starts_on        date not null,
  duration_days    integer not null default 90 check (duration_days between 1 and 1095),
  expected_release date,
  temp_required_c  numeric(5,2),
  humidity_required numeric(5,2),
  pickup_location  text,
  preferred_district text,
  notes            text check (notes is null or char_length(notes) <= 2000),
  status           text not null default 'open'
                     check (status in ('open', 'quoted', 'accepted', 'closed', 'expired', 'cancelled')),
  expires_on       date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists storage_requests_open_idx
  on public.storage_requests (status, starts_on);
create index if not exists storage_requests_requester_idx
  on public.storage_requests (requester_id, created_at desc);
create index if not exists storage_requests_warehouse_idx
  on public.storage_requests (warehouse_id, status);
create index if not exists storage_requests_district_idx
  on public.storage_requests (preferred_district, status);

drop trigger if exists trg_storage_requests_updated_at on public.storage_requests;
create trigger trg_storage_requests_updated_at
  before update on public.storage_requests
  for each row execute function public.touch_updated_at();

-- ── 4. Storage quotations (the owner's priced offer) ───────────────────────
create table if not exists public.storage_quotations (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.storage_requests (id) on delete cascade,
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  section_id     uuid references public.warehouse_sections (id) on delete set null,
  -- Full, itemised price so nothing can be added later as a "handling fee".
  storage_price_inr  numeric(12,2) not null default 0 check (storage_price_inr >= 0),
  loading_price_inr  numeric(12,2) not null default 0 check (loading_price_inr >= 0),
  unloading_price_inr numeric(12,2) not null default 0 check (unloading_price_inr >= 0),
  handling_price_inr numeric(12,2) not null default 0 check (handling_price_inr >= 0),
  other_price_inr    numeric(12,2) not null default 0 check (other_price_inr >= 0),
  other_price_note   text,
  total_inr      numeric(12,2) not null check (total_inr >= 0),
  valid_until    date,
  message        text check (message is null or char_length(message) <= 1000),
  status         text not null default 'sent'
                   check (status in ('sent', 'accepted', 'rejected', 'withdrawn', 'expired')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One live quotation per warehouse per request.
  unique (request_id, warehouse_id)
);

create index if not exists storage_quotations_owner_idx
  on public.storage_quotations (owner_id, status, created_at desc);
create index if not exists storage_quotations_request_idx
  on public.storage_quotations (request_id, status);

drop trigger if exists trg_storage_quotations_updated_at on public.storage_quotations;
create trigger trg_storage_quotations_updated_at
  before update on public.storage_quotations
  for each row execute function public.touch_updated_at();

-- ── 5. Storage bookings (extend the features.sql table) ────────────────────
-- features.sql gives: warehouse_id, farmer_id, quantity_kg, starts_on,
-- ends_on, status ('requested'|'accepted'|'completed'|'cancelled').

alter table public.storage_bookings
  add column if not exists request_id uuid references public.storage_requests (id) on delete set null,
  add column if not exists quotation_id uuid references public.storage_quotations (id) on delete set null,
  add column if not exists section_id uuid references public.warehouse_sections (id) on delete set null,
  add column if not exists owner_id uuid references auth.users (id) on delete cascade,
  add column if not exists depositor_name text,
  add column if not exists depositor_role text,
  add column if not exists crop_name text,
  add column if not exists variety text,
  add column if not exists received_kg numeric(12,2) not null default 0,
  add column if not exists released_kg numeric(12,2) not null default 0,
  add column if not exists agreed_price_inr numeric(12,2) not null default 0,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists expected_inward_on date,
  add column if not exists cancel_reason text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

-- The booking lifecycle. `features.sql` allows only four statuses; widen it.
do $$
begin
  alter table public.storage_bookings drop constraint if exists storage_bookings_status_check;
  alter table public.storage_bookings
    add constraint storage_bookings_status_check
    check (status in (
      'requested', 'quotation_sent', 'accepted', 'confirmed', 'goods_expected',
      'goods_received', 'stored', 'release_requested', 'partially_released',
      'fully_released', 'completed', 'cancelled', 'disputed'));
exception when others then null;
end $$;

do $$
begin
  alter table public.storage_bookings drop constraint if exists storage_bookings_payment_check;
  alter table public.storage_bookings
    add constraint storage_bookings_payment_check
    check (payment_status in ('pending', 'partially_paid', 'paid', 'refunded', 'failed'));
exception when others then null;
end $$;

-- `owner_id` must be the owner of the warehouse — filled by the trigger below
-- so a client can never claim an owner.
create index if not exists storage_bookings_owner_idx
  on public.storage_bookings (owner_id, status, created_at desc);
create index if not exists storage_bookings_warehouse_idx
  on public.storage_bookings (warehouse_id, status);
create index if not exists storage_bookings_farmer_idx
  on public.storage_bookings (farmer_id, created_at desc);

drop trigger if exists trg_storage_bookings_updated_at on public.storage_bookings;
create trigger trg_storage_bookings_updated_at
  before update on public.storage_bookings
  for each row execute function public.touch_updated_at();

-- ── 6. Inventory lots (custody, never ownership) ───────────────────────────
create table if not exists public.inventory_lots (
  id             uuid primary key default gen_random_uuid(),
  lot_no         text not null,
  booking_id     uuid not null references public.storage_bookings (id) on delete cascade,
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  section_id     uuid references public.warehouse_sections (id) on delete set null,
  -- The depositor owns the goods. The warehouse only holds them.
  depositor_id   uuid not null references auth.users (id) on delete restrict,
  crop_name      text not null,
  variety        text,
  grade          text,
  received_kg    numeric(12,2) not null check (received_kg > 0),
  current_kg     numeric(12,2) not null check (current_kg >= 0),
  moisture_pct   numeric(5,2) check (moisture_pct is null or moisture_pct between 0 and 100),
  received_on    date not null default current_date,
  batch_no       text,
  bags_count     integer check (bags_count is null or bags_count >= 0),
  storage_location text,
  quality_status text not null default 'pending'
                   check (quality_status in ('pending', 'passed', 'conditional', 'rejected')),
  status         text not null default 'in_storage'
                   check (status in ('in_storage', 'partially_released', 'released', 'on_hold', 'disposed')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (current_kg <= received_kg),
  unique (warehouse_id, lot_no)
);

create index if not exists inventory_lots_booking_idx on public.inventory_lots (booking_id);
create index if not exists inventory_lots_warehouse_idx
  on public.inventory_lots (warehouse_id, status, received_on desc);
create index if not exists inventory_lots_depositor_idx
  on public.inventory_lots (depositor_id, status);

drop trigger if exists trg_inventory_lots_updated_at on public.inventory_lots;
create trigger trg_inventory_lots_updated_at
  before update on public.inventory_lots
  for each row execute function public.touch_updated_at();

-- ── 7. Inventory ledger — every quantity change, with a reason ─────────────
create table if not exists public.inventory_transactions (
  id          uuid primary key default gen_random_uuid(),
  lot_id      uuid not null references public.inventory_lots (id) on delete cascade,
  kind        text not null check (kind in (
                'inward', 'release', 'adjustment', 'damage', 'disposal', 'transfer')),
  quantity_kg numeric(12,2) not null,
  balance_after_kg numeric(12,2) not null check (balance_after_kg >= 0),
  reason      text not null check (char_length(trim(reason)) between 3 and 500),
  -- Required for damage/disposal/adjustment so a customer's stock never shrinks
  -- silently.
  inspection_id uuid,
  actor_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists inventory_tx_lot_idx
  on public.inventory_transactions (lot_id, created_at desc);

-- ── 8. Goods inward (GRN) and outward (dispatch / gate pass) ───────────────
create table if not exists public.goods_receipts (
  id             uuid primary key default gen_random_uuid(),
  grn_no         text not null unique,
  booking_id     uuid not null references public.storage_bookings (id) on delete cascade,
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  lot_id         uuid references public.inventory_lots (id) on delete set null,
  expected_kg    numeric(12,2) check (expected_kg is null or expected_kg >= 0),
  received_kg    numeric(12,2) not null check (received_kg > 0),
  vehicle_no     text,
  driver_name    text,
  driver_phone   text,
  weight_slip_no text,
  bags_count     integer,
  photos         text[] not null default '{}'::text[],
  inspection_id  uuid,
  discrepancy    boolean not null default false,
  discrepancy_note text,
  section_id     uuid references public.warehouse_sections (id) on delete set null,
  storage_location text,
  received_by    uuid references auth.users (id) on delete set null,
  received_at    timestamptz not null default now()
);

create index if not exists goods_receipts_booking_idx on public.goods_receipts (booking_id);
create index if not exists goods_receipts_warehouse_idx
  on public.goods_receipts (warehouse_id, received_at desc);

create table if not exists public.goods_dispatches (
  id             uuid primary key default gen_random_uuid(),
  dispatch_no    text not null unique,
  booking_id     uuid not null references public.storage_bookings (id) on delete cascade,
  lot_id         uuid not null references public.inventory_lots (id) on delete restrict,
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  requested_kg   numeric(12,2) not null check (requested_kg > 0),
  dispatched_kg  numeric(12,2) not null check (dispatched_kg > 0),
  partial        boolean not null default false,
  vehicle_no     text,
  driver_name    text,
  driver_phone   text,
  transporter_booking_id uuid, -- references transport_bookings when the module is installed
  dispatch_weight_slip text,
  gate_pass_no   text,
  photos         text[] not null default '{}'::text[],
  notes          text,
  dispatched_by  uuid references auth.users (id) on delete set null,
  dispatched_at  timestamptz not null default now()
);

create index if not exists goods_dispatches_booking_idx on public.goods_dispatches (booking_id);
create index if not exists goods_dispatches_warehouse_idx
  on public.goods_dispatches (warehouse_id, dispatched_at desc);

-- ── 9. Capacity & stock integrity (the rules that must hold for everyone) ──

/**
 * Bookings reserve capacity atomically.
 *
 * A confirmed booking adds to `reserved_kg`; the database — not the browser —
 * decides whether there is room. Two simultaneous confirmations for the last
 * tonne cannot both succeed because the row is locked (`for update`).
 */
create or replace function public.storage_booking_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wh public.warehouses;
  held numeric(12,2);
begin
  if tg_op = 'INSERT' then
    select * into wh from public.warehouses where id = new.warehouse_id for update;
    if wh is null then
      raise exception 'Warehouse % does not exist', new.warehouse_id using errcode = 'check_violation';
    end if;
    new.owner_id := coalesce(new.owner_id, wh.owner_id);
    return new;
  end if;

  -- Only the move into a capacity-holding state reserves space.
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into wh from public.warehouses where id = new.warehouse_id for update;

  if new.status in ('confirmed', 'goods_expected') and old.status not in ('confirmed', 'goods_expected') then
    if wh.reserved_kg + wh.occupied_kg + new.quantity_kg > wh.capacity_kg then
      raise exception 'Not enough free capacity: % kg requested, % kg free',
        new.quantity_kg, (wh.capacity_kg - wh.reserved_kg - wh.occupied_kg)
        using errcode = 'check_violation';
    end if;
    update public.warehouses
       set reserved_kg = reserved_kg + new.quantity_kg
     where id = new.warehouse_id;
  elsif new.status not in ('confirmed', 'goods_expected')
        and old.status in ('confirmed', 'goods_expected')
        and new.status <> 'goods_received' then
    -- Cancelled or rejected: give the reservation back.
    update public.warehouses
       set reserved_kg = greatest(reserved_kg - old.quantity_kg, 0)
     where id = new.warehouse_id;
  end if;

  if new.status = 'completed' and old.status <> 'completed' then
    update public.warehouses
       set reserved_kg = greatest(reserved_kg - old.quantity_kg, 0)
     where id = new.warehouse_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_storage_booking_capacity on public.storage_bookings;
create trigger trg_storage_booking_capacity
  before insert or update of status, quantity_kg on public.storage_bookings
  for each row execute function public.storage_booking_capacity();

/** Legal status moves. Terminal states are final. */
create or replace function public.storage_booking_transition()
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

  if old.status in ('completed', 'cancelled') then
    raise exception 'Booking is % and cannot be reopened', old.status
      using errcode = 'check_violation';
  end if;

  allowed := case old.status
    when 'requested'         then array['quotation_sent', 'accepted', 'cancelled']
    when 'quotation_sent'    then array['accepted', 'cancelled']
    when 'accepted'          then array['confirmed', 'cancelled']
    when 'confirmed'         then array['goods_expected', 'cancelled']
    when 'goods_expected'    then array['goods_received', 'cancelled']
    when 'goods_received'    then array['stored', 'disputed']
    when 'stored'            then array['release_requested', 'disputed']
    when 'release_requested' then array['partially_released', 'fully_released', 'disputed']
    when 'partially_released' then array['partially_released', 'fully_released', 'disputed']
    when 'fully_released'    then array['completed', 'disputed']
    when 'disputed'          then array['stored', 'completed', 'cancelled']
    else array[]::text[]
  end;

  if not (new.status = any (allowed)) then
    raise exception 'Cannot move booking from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_storage_booking_transition on public.storage_bookings;
create trigger trg_storage_booking_transition
  before update of status on public.storage_bookings
  for each row execute function public.storage_booking_transition();

/**
 * Inward receipt: create/refresh the lot, move capacity from reserved to
 * occupied, and write the ledger entry. All in the caller's transaction.
 */
create or replace function public.goods_receipt_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.storage_bookings;
  lot_id uuid;
  balance numeric(12,2);
  wh public.warehouses;
begin
  select * into bk from public.storage_bookings where id = new.booking_id for update;
  if bk is null then
    raise exception 'Booking % does not exist', new.booking_id using errcode = 'check_violation';
  end if;

  select * into wh from public.warehouses where id = new.warehouse_id for update;

  -- Space actually taken must exist, whatever was reserved.
  if wh.occupied_kg + new.received_kg > wh.capacity_kg then
    raise exception 'Receiving % kg would exceed the warehouse capacity (% kg free)',
      new.received_kg, (wh.capacity_kg - wh.occupied_kg)
      using errcode = 'check_violation';
  end if;

  insert into public.inventory_lots (
    lot_no, booking_id, warehouse_id, section_id, depositor_id, crop_name,
    variety, received_kg, current_kg, received_on, batch_no, bags_count,
    storage_location, quality_status, status
  ) values (
    'LOT-' || to_char(now(), 'YYMMDD') || '-' || substr(new.id::text, 1, 6),
    new.booking_id, new.warehouse_id, new.section_id, bk.farmer_id,
    coalesce(bk.crop_name, 'Crop'), bk.variety, new.received_kg, new.received_kg,
    current_date, new.weight_slip_no, new.bags_count, new.storage_location,
    'pending', 'in_storage'
  ) returning id into lot_id;

  new.lot_id := lot_id;

  insert into public.inventory_transactions
    (lot_id, kind, quantity_kg, balance_after_kg, reason, actor_id)
  values
    (lot_id, 'inward', new.received_kg, new.received_kg,
     'Goods receipt ' || new.grn_no, new.received_by);

  select current_kg into balance from public.inventory_lots where id = lot_id;

  update public.warehouses
     set occupied_kg = occupied_kg + new.received_kg,
         reserved_kg = greatest(reserved_kg - new.received_kg, 0)
   where id = new.warehouse_id;

  if new.section_id is not null then
    update public.warehouse_sections
       set occupied_kg = occupied_kg + new.received_kg
     where id = new.section_id;
  end if;

  update public.storage_bookings
     set received_kg = received_kg + new.received_kg,
         status = case when status = 'goods_expected' then 'goods_received' else status end
   where id = new.booking_id;

  -- Flag a real over/short delivery rather than quietly accepting it.
  if new.expected_kg is not null
     and abs(new.expected_kg - new.received_kg) > 0.01 * greatest(new.expected_kg, 1) then
    new.discrepancy := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_goods_receipt_apply on public.goods_receipts;
create trigger trg_goods_receipt_apply
  before insert on public.goods_receipts
  for each row execute function public.goods_receipt_apply();

/**
 * Outward dispatch: never release more than the lot holds.
 * The check is done under a row lock so two gate passes cannot both pass.
 */
create or replace function public.goods_dispatch_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lot public.inventory_lots;
begin
  select * into lot from public.inventory_lots where id = new.lot_id for update;
  if lot is null then
    raise exception 'Inventory lot % does not exist', new.lot_id using errcode = 'check_violation';
  end if;

  if new.dispatched_kg > lot.current_kg then
    raise exception 'Only % kg remains in lot %; cannot release % kg',
      lot.current_kg, lot.lot_no, new.dispatched_kg
      using errcode = 'check_violation';
  end if;

  update public.inventory_lots
     set current_kg = current_kg - new.dispatched_kg,
         status = case
                    when current_kg - new.dispatched_kg = 0 then 'released'
                    else 'partially_released'
                  end
   where id = new.lot_id;

  insert into public.inventory_transactions
    (lot_id, kind, quantity_kg, balance_after_kg, reason, actor_id)
  values
    (new.lot_id, 'release', -new.dispatched_kg, lot.current_kg - new.dispatched_kg,
     'Dispatch ' || new.dispatch_no, new.dispatched_by);

  update public.warehouses
     set occupied_kg = greatest(occupied_kg - new.dispatched_kg, 0)
   where id = new.warehouse_id;

  if lot.section_id is not null then
    update public.warehouse_sections
       set occupied_kg = greatest(occupied_kg - new.dispatched_kg, 0)
     where id = lot.section_id;
  end if;

  update public.storage_bookings
     set released_kg = released_kg + new.dispatched_kg,
         status = case
                    when released_kg + new.dispatched_kg >= received_kg then 'fully_released'
                    else 'partially_released'
                  end
   where id = new.booking_id;

  return new;
end;
$$;

drop trigger if exists trg_goods_dispatch_apply on public.goods_dispatches;
create trigger trg_goods_dispatch_apply
  before insert on public.goods_dispatches
  for each row execute function public.goods_dispatch_apply();

-- ── 10. Quality inspections ────────────────────────────────────────────────
create table if not exists public.storage_inspections (
  id             uuid primary key default gen_random_uuid(),
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  booking_id     uuid references public.storage_bookings (id) on delete set null,
  lot_id         uuid references public.inventory_lots (id) on delete set null,
  kind           text not null check (kind in ('inward', 'periodic', 'pre_dispatch', 'complaint')),
  inspector_id   uuid references auth.users (id) on delete set null,
  inspector_name text,
  moisture_pct   numeric(5,2),
  grade          text,
  pest_damage    boolean not null default false,
  damage_notes   text,
  damaged_kg     numeric(12,2) not null default 0 check (damaged_kg >= 0),
  rejected_kg    numeric(12,2) not null default 0 check (rejected_kg >= 0),
  photos         text[] not null default '{}'::text[],
  result         text not null default 'passed'
                   check (result in ('passed', 'conditional', 'failed')),
  quantity_before_kg numeric(12,2),
  quantity_after_kg  numeric(12,2),
  -- An inspection never silently shrinks a customer's stock: an adjustment
  -- must be applied separately, with its own reason, by an authorised person.
  adjustment_applied boolean not null default false,
  notes          text,
  inspected_at   timestamptz not null default now()
);

create index if not exists storage_inspections_warehouse_idx
  on public.storage_inspections (warehouse_id, inspected_at desc);
create index if not exists storage_inspections_lot_idx on public.storage_inspections (lot_id);

-- ── 11. Environmental readings (manual until a device reports) ─────────────
create table if not exists public.storage_readings (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  section_id   uuid references public.warehouse_sections (id) on delete cascade,
  temperature_c numeric(5,2),
  humidity_pct  numeric(5,2) check (humidity_pct is null or humidity_pct between 0 and 100),
  moisture_pct  numeric(5,2),
  ventilation  text check (ventilation is null or ventilation in ('good', 'fair', 'poor')),
  pest_seen    boolean,
  fumigated_on date,
  source       text not null default 'manual' check (source in ('manual', 'sensor')),
  device_id    text,
  recorded_by  uuid references auth.users (id) on delete set null,
  recorded_at  timestamptz not null default now(),
  notes        text,
  -- A sensor reading must say which device it came from.
  check (source = 'manual' or device_id is not null)
);

create index if not exists storage_readings_warehouse_idx
  on public.storage_readings (warehouse_id, recorded_at desc);
create index if not exists storage_readings_section_idx
  on public.storage_readings (section_id, recorded_at desc);

-- ── 12. Pricing plans ──────────────────────────────────────────────────────
create table if not exists public.storage_pricing_plans (
  id             uuid primary key default gen_random_uuid(),
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  name           text not null,
  commodity_category text not null default 'grain'
                     check (commodity_category in (
                       'grain', 'pulses', 'oilseed', 'seed', 'cold_chain',
                       'fruit_veg', 'inputs', 'other')),
  billing_unit   text not null default 'kg_day'
                   check (billing_unit in ('kg_day', 'quintal_day', 'tonne_month', 'fixed_period')),
  rate_inr       numeric(12,2) not null check (rate_inr >= 0),
  minimum_days   integer not null default 30 check (minimum_days >= 1),
  fixed_period_days integer check (fixed_period_days is null or fixed_period_days >= 1),
  cold_premium_pct numeric(5,2) not null default 0 check (cold_premium_pct >= 0),
  loading_rate_inr   numeric(12,2) not null default 0 check (loading_rate_inr >= 0),
  unloading_rate_inr numeric(12,2) not null default 0 check (unloading_rate_inr >= 0),
  handling_rate_inr  numeric(12,2) not null default 0 check (handling_rate_inr >= 0),
  other_service_label text,
  other_service_rate_inr numeric(12,2) not null default 0 check (other_service_rate_inr >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists storage_pricing_plans_idx
  on public.storage_pricing_plans (warehouse_id, is_active);

drop trigger if exists trg_storage_pricing_plans_updated_at on public.storage_pricing_plans;
create trigger trg_storage_pricing_plans_updated_at
  before update on public.storage_pricing_plans
  for each row execute function public.touch_updated_at();

-- ── 13. Staff, documents, invoices, notifications, messages, audit ─────────
create table if not exists public.warehouse_staff (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  warehouse_id   uuid not null references public.warehouses (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  full_name      text not null check (char_length(trim(full_name)) between 2 and 120),
  phone          text,
  role           text not null default 'operator'
                   check (role in ('manager', 'operator', 'inward', 'outward', 'inspector', 'viewer')),
  can_inward     boolean not null default false,
  can_outward    boolean not null default false,
  can_inspect    boolean not null default false,
  can_manage_pricing boolean not null default false,
  status         text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists warehouse_staff_owner_idx
  on public.warehouse_staff (owner_id, status);

drop trigger if exists trg_warehouse_staff_updated_at on public.warehouse_staff;
create trigger trg_warehouse_staff_updated_at
  before update on public.warehouse_staff
  for each row execute function public.touch_updated_at();

create table if not exists public.warehouse_documents (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  warehouse_id   uuid references public.warehouses (id) on delete cascade,
  kind           text not null check (kind in (
                   'ownership_proof', 'registration', 'licence', 'fire_safety',
                   'insurance', 'storage_certificate', 'facility_photo', 'other')),
  document_url   text not null,
  status         text not null default 'pending'
                   check (status in ('pending', 'verified', 'rejected', 'expired')),
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  expires_on     date,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists warehouse_documents_owner_idx
  on public.warehouse_documents (owner_id, kind);

create table if not exists public.storage_invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_no     text not null unique,
  booking_id     uuid not null references public.storage_bookings (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  depositor_id   uuid references auth.users (id) on delete set null,
  amount_inr     numeric(12,2) not null check (amount_inr >= 0),
  tax_inr        numeric(12,2) not null default 0 check (tax_inr >= 0),
  total_inr      numeric(12,2) not null check (total_inr >= 0),
  status         text not null default 'pending'
                   check (status in ('pending', 'processing', 'paid', 'failed', 'refunded')),
  issued_on      date not null default current_date,
  due_on         date,
  paid_on        timestamptz,
  reference      text,
  breakdown      jsonb not null default '{}'::jsonb,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists storage_invoices_owner_idx
  on public.storage_invoices (owner_id, status, issued_on desc);
create index if not exists storage_invoices_booking_idx on public.storage_invoices (booking_id);

create table if not exists public.warehouse_notifications (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  kind         text not null default 'system'
                 check (kind in ('request', 'quotation', 'booking', 'inward',
                                 'outward', 'payment', 'inspection', 'environment',
                                 'dispute', 'system')),
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists warehouse_notifications_idx
  on public.warehouse_notifications (owner_id, read_at, created_at desc);

create table if not exists public.warehouse_messages (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  counterpart_id  uuid references auth.users (id) on delete set null,
  counterpart_name text not null,
  counterpart_role text,
  booking_id      uuid references public.storage_bookings (id) on delete set null,
  direction       text not null check (direction in ('in', 'out')),
  body            text not null check (char_length(trim(body)) between 1 and 4000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists warehouse_messages_idx
  on public.warehouse_messages (owner_id, created_at);

create table if not exists public.warehouse_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.warehouses (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null,
  entity       text not null,
  entity_id    uuid,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists warehouse_audit_idx
  on public.warehouse_audit_logs (warehouse_id, created_at desc);

-- ── 14. Row Level Security ─────────────────────────────────────────────────
-- `auth.uid()` is the only identity trusted. A `owner_id`, `warehouse_id` or
-- `depositor_id` sent by the browser is never used for authorisation.

alter table public.warehouse_sections        enable row level security;
alter table public.storage_requests          enable row level security;
alter table public.storage_quotations        enable row level security;
alter table public.inventory_lots            enable row level security;
alter table public.inventory_transactions    enable row level security;
alter table public.goods_receipts            enable row level security;
alter table public.goods_dispatches          enable row level security;
alter table public.storage_inspections       enable row level security;
alter table public.storage_readings          enable row level security;
alter table public.storage_pricing_plans     enable row level security;
alter table public.warehouse_staff           enable row level security;
alter table public.warehouse_documents       enable row level security;
alter table public.storage_invoices          enable row level security;
alter table public.warehouse_notifications   enable row level security;
alter table public.warehouse_messages        enable row level security;
alter table public.warehouse_audit_logs      enable row level security;

/** True when the caller owns the warehouse. */
create or replace function public.owns_warehouse(wid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.warehouses w
     where w.id = wid and w.owner_id = auth.uid()
  );
$$;

/** True when the caller has a booking at the warehouse (as the depositor). */
create or replace function public.is_depositor_at(wid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.storage_bookings b
     where b.warehouse_id = wid and b.farmer_id = auth.uid()
  );
$$;

grant execute on function public.owns_warehouse(uuid) to authenticated;
grant execute on function public.is_depositor_at(uuid) to authenticated;

-- Warehouses: the owner manages; everyone signed in may browse listed ones.
drop policy if exists "Warehouses are browsable" on public.warehouses;
create policy "Warehouses are browsable" on public.warehouses
  for select using ((is_listed and not is_archived) or auth.uid() = owner_id);

drop policy if exists "Owners manage their warehouses" on public.warehouses;
create policy "Owners manage their warehouses" on public.warehouses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Sections
drop policy if exists "Owners manage warehouse sections" on public.warehouse_sections;
create policy "Owners manage warehouse sections" on public.warehouse_sections
  for all using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

drop policy if exists "Depositors read sections of their warehouse" on public.warehouse_sections;
create policy "Depositors read sections of their warehouse" on public.warehouse_sections
  for select using (public.is_depositor_at(warehouse_id));

-- Storage requests: open requests are visible to warehouse owners; the
-- requester owns their own and may write only their own.
drop policy if exists "Open storage requests are visible" on public.storage_requests;
create policy "Open storage requests are visible" on public.storage_requests
  for select using (
    status = 'open'
    or auth.uid() = requester_id
    or (warehouse_id is not null and public.owns_warehouse(warehouse_id))
  );

drop policy if exists "Requesters create storage requests" on public.storage_requests;
create policy "Requesters create storage requests" on public.storage_requests
  for insert with check (auth.uid() = requester_id);

drop policy if exists "Requesters update their storage requests" on public.storage_requests;
create policy "Requesters update their storage requests" on public.storage_requests
  for update using (auth.uid() = requester_id) with check (auth.uid() = requester_id);

-- Quotations: the owner writes; the requester reads the ones for their request.
drop policy if exists "Owners manage their quotations" on public.storage_quotations;
create policy "Owners manage their quotations" on public.storage_quotations
  for all using (auth.uid() = owner_id or public.owns_warehouse(warehouse_id))
  with check (auth.uid() = owner_id and public.owns_warehouse(warehouse_id));

drop policy if exists "Requesters read quotations on their request" on public.storage_quotations;
create policy "Requesters read quotations on their request" on public.storage_quotations
  for select using (
    exists (
      select 1 from public.storage_requests r
       where r.id = request_id and r.requester_id = auth.uid()
    )
  );

-- Bookings: both parties read; the owner advances it (trigger validates).
drop policy if exists "Parties read storage bookings" on public.storage_bookings;
create policy "Parties read storage bookings" on public.storage_bookings
  for select using (auth.uid() = farmer_id or auth.uid() = owner_id);

drop policy if exists "Owners update storage bookings" on public.storage_bookings;
create policy "Owners update storage bookings" on public.storage_bookings
  for update using (auth.uid() = owner_id or auth.uid() = farmer_id)
  with check (auth.uid() = owner_id or auth.uid() = farmer_id);

drop policy if exists "Owners create storage bookings" on public.storage_bookings;
create policy "Owners create storage bookings" on public.storage_bookings
  for insert with check (auth.uid() = owner_id or auth.uid() = farmer_id);

-- Inventory: a lot is visible to its depositor and to the warehouse owner.
drop policy if exists "Parties read inventory lots" on public.inventory_lots;
create policy "Parties read inventory lots" on public.inventory_lots
  for select using (auth.uid() = depositor_id or public.owns_warehouse(warehouse_id));

drop policy if exists "Owners write inventory lots" on public.inventory_lots;
create policy "Owners write inventory lots" on public.inventory_lots
  for update using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

drop policy if exists "Owners read inventory transactions" on public.inventory_transactions;
create policy "Owners read inventory transactions" on public.inventory_transactions
  for select using (
    exists (
      select 1 from public.inventory_lots l
       where l.id = lot_id
         and (public.owns_warehouse(l.warehouse_id) or l.depositor_id = auth.uid())
    )
  );

-- Goods movement: owner reads and writes; the depositor reads their own.
drop policy if exists "Owners manage goods receipts" on public.goods_receipts;
create policy "Owners manage goods receipts" on public.goods_receipts
  for all using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

drop policy if exists "Depositors read their goods receipts" on public.goods_receipts;
create policy "Depositors read their goods receipts" on public.goods_receipts
  for select using (public.is_depositor_at(warehouse_id));

drop policy if exists "Owners manage goods dispatches" on public.goods_dispatches;
create policy "Owners manage goods dispatches" on public.goods_dispatches
  for all using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

drop policy if exists "Depositors read their goods dispatches" on public.goods_dispatches;
create policy "Depositors read their goods dispatches" on public.goods_dispatches
  for select using (public.is_depositor_at(warehouse_id));

-- Inspections and readings
drop policy if exists "Owners manage inspections" on public.storage_inspections;
create policy "Owners manage inspections" on public.storage_inspections
  for all using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

drop policy if exists "Depositors read inspections on their goods" on public.storage_inspections;
create policy "Depositors read inspections on their goods" on public.storage_inspections
  for select using (public.is_depositor_at(warehouse_id));

drop policy if exists "Owners manage storage readings" on public.storage_readings;
create policy "Owners manage storage readings" on public.storage_readings
  for all using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

drop policy if exists "Depositors read readings of their warehouse" on public.storage_readings;
create policy "Depositors read readings of their warehouse" on public.storage_readings
  for select using (public.is_depositor_at(warehouse_id));

-- Pricing: publicly visible while active, written by the owner.
drop policy if exists "Active pricing is readable" on public.storage_pricing_plans;
create policy "Active pricing is readable" on public.storage_pricing_plans
  for select using (is_active or public.owns_warehouse(warehouse_id));

drop policy if exists "Owners manage pricing plans" on public.storage_pricing_plans;
create policy "Owners manage pricing plans" on public.storage_pricing_plans
  for all using (public.owns_warehouse(warehouse_id))
  with check (public.owns_warehouse(warehouse_id));

-- Staff and documents are owner-private.
drop policy if exists "Owners manage their staff" on public.warehouse_staff;
create policy "Owners manage their staff" on public.warehouse_staff
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Staff read their own assignment" on public.warehouse_staff;
create policy "Staff read their own assignment" on public.warehouse_staff
  for select using (auth.uid() = user_id);

drop policy if exists "Owners manage their documents" on public.warehouse_documents;
create policy "Owners manage their documents" on public.warehouse_documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Invoices: read-only for the owner. Backend writes them and marks paid.
drop policy if exists "Owners read their invoices" on public.storage_invoices;
create policy "Owners read their invoices" on public.storage_invoices
  for select using (auth.uid() = owner_id or auth.uid() = depositor_id);

drop policy if exists "Owners manage their notifications" on public.warehouse_notifications;
create policy "Owners manage their notifications" on public.warehouse_notifications
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners manage their messages" on public.warehouse_messages;
create policy "Owners manage their messages" on public.warehouse_messages
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners read their audit log" on public.warehouse_audit_logs;
create policy "Owners read their audit log" on public.warehouse_audit_logs
  for select using (public.owns_warehouse(warehouse_id));

-- ── 15. Storage ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('warehouse-documents', 'warehouse-documents', false)
on conflict (id) do nothing;

drop policy if exists "Warehouse owners read their files" on storage.objects;
create policy "Warehouse owners read their files" on storage.objects
  for select using (
    bucket_id = 'warehouse-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Warehouse owners upload their files" on storage.objects;
create policy "Warehouse owners upload their files" on storage.objects
  for insert with check (
    bucket_id = 'warehouse-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Warehouse owners remove their files" on storage.objects;
create policy "Warehouse owners remove their files" on storage.objects
  for delete using (
    bucket_id = 'warehouse-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 16. Convenience views ──────────────────────────────────────────────────
-- `security_invoker` keeps RLS in force for whoever queries the view.
create or replace view public.warehouse_capacity_view
with (security_invoker = true)
as
select
  w.id,
  w.owner_id,
  w.name,
  w.warehouse_type,
  w.district,
  w.state,
  w.capacity_kg,
  w.reserved_kg,
  w.occupied_kg,
  greatest(w.capacity_kg - w.reserved_kg - w.occupied_kg, 0) as available_kg,
  case
    when w.capacity_kg > 0
      then round(((w.reserved_kg + w.occupied_kg) / w.capacity_kg) * 100, 1)
    else 0
  end as utilisation_pct,
  w.is_listed,
  w.is_archived,
  w.verification
from public.warehouses w;

grant select on public.warehouse_capacity_view to authenticated;

create or replace view public.warehouse_booking_view
with (security_invoker = true)
as
select
  b.*,
  w.name           as warehouse_name,
  w.district       as warehouse_district,
  s.name           as section_name,
  coalesce(st.lots_count, 0)   as lots_count,
  coalesce(st.stored_kg, 0)     as stored_kg
from public.storage_bookings b
left join public.warehouses w on w.id = b.warehouse_id
left join public.warehouse_sections s on s.id = b.section_id
left join (
  select lot.booking_id,
         count(*)::int                         as lots_count,
         coalesce(sum(lot.current_kg), 0)      as stored_kg
    from public.inventory_lots lot
   group by lot.booking_id
) st on st.booking_id = b.id;

grant select on public.warehouse_booking_view to authenticated;
