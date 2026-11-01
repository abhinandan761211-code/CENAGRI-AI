-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — feature tables (marketplace, community, rental, transport,
-- storage). Run AFTER schema.sql. Safe to re-run.
--
-- These back the dashboard features that currently ship as demo previews.
-- Nothing here seeds fake rows: every table starts empty by design.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Marketplace ────────────────────────────────────────────────────────────
create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  category     text not null check (category in
                 ('Grains','Vegetables','Fruits','Seeds','Fertiliser','Equipment')),
  description  text,
  quantity_kg  numeric(12,2) check (quantity_kg is null or quantity_kg > 0),
  price_inr    numeric(12,2) check (price_inr is null or price_inr >= 0),
  unit         text not null default 'quintal' check (unit in ('kg','quintal','tonne','piece')),
  district     text,
  state        text,
  image_url    text,
  status       text not null default 'active'
                 check (status in ('draft','active','sold','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists listings_active_idx
  on public.listings (status, category, created_at desc);
create index if not exists listings_seller_idx on public.listings (seller_id);

create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete restrict,
  buyer_id     uuid not null references auth.users (id) on delete cascade,
  quantity_kg  numeric(12,2) not null check (quantity_kg > 0),
  amount_inr   numeric(12,2) not null check (amount_inr >= 0),
  status       text not null default 'pending'
                 check (status in ('pending','confirmed','delivered','cancelled')),
  created_at   timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);

-- ── CenFriend (community) ──────────────────────────────────────────────────
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  image_url   text,
  district    text,
  crop        text,
  created_at  timestamptz not null default now()
);
create index if not exists posts_district_idx on public.posts (district, created_at desc);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- ── Equipment rental ───────────────────────────────────────────────────────
create table if not exists public.equipment (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  kind         text not null check (kind in
                 ('Tractor','Power tiller','Harvester','Pump','Sprayer','Other')),
  rate_inr     numeric(12,2) not null check (rate_inr > 0),
  rate_unit    text not null default 'hour' check (rate_unit in ('hour','day','acre')),
  district     text,
  state        text,
  available    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists equipment_district_idx on public.equipment (district, available);

create table if not exists public.equipment_bookings (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null references public.equipment (id) on delete cascade,
  renter_id     uuid not null references auth.users (id) on delete cascade,
  starts_on     date not null,
  ends_on       date not null,
  status        text not null default 'requested'
                  check (status in ('requested','accepted','declined','completed')),
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);
-- One machine cannot be booked twice over overlapping dates.
create index if not exists equipment_bookings_range_idx
  on public.equipment_bookings (equipment_id, starts_on, ends_on);

-- ── Transport ──────────────────────────────────────────────────────────────
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('Truck','Tempo','Tractor-trolley','Other')),
  capacity_kg  numeric(12,2) not null check (capacity_kg > 0),
  district     text,
  state        text,
  available    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.transport_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  pickup       text not null,
  dropoff      text not null,
  load_kg      numeric(12,2) check (load_kg is null or load_kg > 0),
  needed_on    date,
  status       text not null default 'open'
                 check (status in ('open','assigned','completed','cancelled')),
  created_at   timestamptz not null default now()
);
create index if not exists transport_open_idx on public.transport_requests (status, needed_on);

-- ── Storage ────────────────────────────────────────────────────────────────
create table if not exists public.warehouses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('Dry','Cold')),
  capacity_kg    numeric(12,2) not null check (capacity_kg > 0),
  available_kg   numeric(12,2) not null check (available_kg >= 0),
  rate_inr       numeric(12,2) check (rate_inr is null or rate_inr >= 0),
  rate_unit      text not null default 'quintal_month'
                   check (rate_unit in ('quintal_month','kg_month')),
  district       text,
  state          text,
  created_at     timestamptz not null default now(),
  check (available_kg <= capacity_kg)
);

create table if not exists public.storage_bookings (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references public.warehouses (id) on delete cascade,
  farmer_id     uuid not null references auth.users (id) on delete cascade,
  quantity_kg   numeric(12,2) not null check (quantity_kg > 0),
  starts_on     date not null,
  ends_on       date not null,
  status        text not null default 'requested'
                  check (status in ('requested','accepted','completed','cancelled')),
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ── Row-level security ─────────────────────────────────────────────────────
-- Owners write; signed-in users read what is published. Mirrors schema.sql.

alter table public.listings            enable row level security;
alter table public.orders              enable row level security;
alter table public.posts               enable row level security;
alter table public.comments            enable row level security;
alter table public.equipment           enable row level security;
alter table public.equipment_bookings  enable row level security;
alter table public.vehicles            enable row level security;
alter table public.transport_requests  enable row level security;
alter table public.warehouses          enable row level security;
alter table public.storage_bookings    enable row level security;

-- Listings: everyone signed in can browse active ones; only the seller writes.
drop policy if exists "Listings are browsable" on public.listings;
create policy "Listings are browsable" on public.listings
  for select using (status = 'active' or auth.uid() = seller_id);

drop policy if exists "Sellers manage their listings" on public.listings;
create policy "Sellers manage their listings" on public.listings
  for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- Orders: buyer and seller can each see the order.
drop policy if exists "Orders visible to buyer and seller" on public.orders;
create policy "Orders visible to buyer and seller" on public.orders
  for select using (
    auth.uid() = buyer_id
    or auth.uid() = (select seller_id from public.listings where id = listing_id)
  );

drop policy if exists "Buyers create orders" on public.orders;
create policy "Buyers create orders" on public.orders
  for insert with check (auth.uid() = buyer_id);

-- Posts / comments: readable by all signed-in, written by author.
drop policy if exists "Posts readable by signed-in users" on public.posts;
create policy "Posts readable by signed-in users" on public.posts
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authors manage their posts" on public.posts;
create policy "Authors manage their posts" on public.posts
  for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "Comments readable by signed-in users" on public.comments;
create policy "Comments readable by signed-in users" on public.comments
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authors manage their comments" on public.comments;
create policy "Authors manage their comments" on public.comments
  for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- Equipment / vehicles / warehouses: browse what is available, owner writes.
drop policy if exists "Equipment is browsable" on public.equipment;
create policy "Equipment is browsable" on public.equipment
  for select using (available or auth.uid() = owner_id);

drop policy if exists "Owners manage their equipment" on public.equipment;
create policy "Owners manage their equipment" on public.equipment
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Vehicles are browsable" on public.vehicles;
create policy "Vehicles are browsable" on public.vehicles
  for select using (available or auth.uid() = owner_id);

drop policy if exists "Owners manage their vehicles" on public.vehicles;
create policy "Owners manage their vehicles" on public.vehicles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Warehouses are browsable" on public.warehouses;
create policy "Warehouses are browsable" on public.warehouses
  for select using (auth.role() = 'authenticated');

drop policy if exists "Owners manage their warehouses" on public.warehouses;
create policy "Owners manage their warehouses" on public.warehouses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Bookings: the person who booked, plus the owner of the asset.
drop policy if exists "Equipment bookings visible to renter and owner" on public.equipment_bookings;
create policy "Equipment bookings visible to renter and owner" on public.equipment_bookings
  for select using (
    auth.uid() = renter_id
    or auth.uid() = (select owner_id from public.equipment where id = equipment_id)
  );

drop policy if exists "Renters create equipment bookings" on public.equipment_bookings;
create policy "Renters create equipment bookings" on public.equipment_bookings
  for insert with check (auth.uid() = renter_id);

drop policy if exists "Storage bookings visible to farmer and owner" on public.storage_bookings;
create policy "Storage bookings visible to farmer and owner" on public.storage_bookings
  for select using (
    auth.uid() = farmer_id
    or auth.uid() = (select owner_id from public.warehouses where id = warehouse_id)
  );

drop policy if exists "Farmers create storage bookings" on public.storage_bookings;
create policy "Farmers create storage bookings" on public.storage_bookings
  for insert with check (auth.uid() = farmer_id);

drop policy if exists "Transport requests visible to requester" on public.transport_requests;
create policy "Transport requests visible to requester" on public.transport_requests
  for all using (auth.uid() = requester_id) with check (auth.uid() = requester_id);
