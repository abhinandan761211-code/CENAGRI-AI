-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Retailer module
-- Run AFTER schema.sql and features.sql. Safe to re-run.
--
-- A retailer is NOT a buyer. The retailer sells agricultural inputs (seeds,
-- fertilisers, pesticides, tools, irrigation) to farmers and manages stock.
-- The buyer sources produce from farmers. They share `profiles` and `orders`
-- shape, but the tables below are retailer-only.
--
-- Nothing here seeds fake rows: every table starts empty by design.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Shop profile ───────────────────────────────────────────────────────────
-- One row per retailer. Name / address / GST / hours / verification all live
-- here rather than in `profiles.details` so they can be queried and verified.
create table if not exists public.retailer_shops (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null unique references auth.users (id) on delete cascade,
  shop_name      text not null check (char_length(trim(shop_name)) between 1 and 120),
  shop_type      text,
  address_line   text,
  district       text,
  state          text,
  pincode        text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  phone          text,
  gstin          text check (
                   gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'
                 ),
  license_no     text,          -- seed / pesticide licence number
  opening_time   time,
  closing_time   time,
  weekly_off     text,          -- e.g. 'Sunday' (null = open all week)
  verification   text not null default 'pending'
                   check (verification in ('pending', 'submitted', 'verified', 'rejected')),
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists retailer_shops_district_idx
  on public.retailer_shops (district, verification);

drop trigger if exists trg_retailer_shops_updated_at on public.retailer_shops;
create trigger trg_retailer_shops_updated_at
  before update on public.retailer_shops
  for each row execute function public.touch_updated_at();

-- ── Products (agri-input catalogue) ────────────────────────────────────────
create table if not exists public.retailer_products (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(trim(name)) between 1 and 160),
  brand          text,
  category       text not null check (category in
                   ('Seeds','Fertilizers','Pesticides','Tools','Irrigation')),
  description    text,
  unit           text not null default 'kg'
                   check (unit in ('kg','g','litre','ml','piece','bag','packet')),
  price_inr      numeric(12,2) not null check (price_inr >= 0),
  mrp_inr        numeric(12,2) check (mrp_inr is null or mrp_inr >= price_inr),
  stock_qty      numeric(12,2) not null default 0 check (stock_qty >= 0),
  low_stock_at   numeric(12,2) not null default 10 check (low_stock_at >= 0),
  -- Expiry is mandatory for fertilisers and pesticides, optional elsewhere.
  expiry_date    date,
  batch_no       text,
  image_url      text,
  status         text not null default 'active'
                   check (status in ('active','paused','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint retailer_products_expiry_required check (
    category not in ('Fertilizers','Pesticides') or expiry_date is not null
  )
);
create index if not exists retailer_products_owner_idx
  on public.retailer_products (retailer_id, status, category);
-- Drives the low-stock and expiry-alert screens.
create index if not exists retailer_products_expiry_idx
  on public.retailer_products (retailer_id, expiry_date)
  where expiry_date is not null;
create index if not exists retailer_products_stock_idx
  on public.retailer_products (retailer_id, stock_qty);

drop trigger if exists trg_retailer_products_updated_at on public.retailer_products;
create trigger trg_retailer_products_updated_at
  before update on public.retailer_products
  for each row execute function public.touch_updated_at();

-- ── Customer orders (farmers buying inputs from the shop) ──────────────────
create table if not exists public.retailer_orders (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references auth.users (id) on delete cascade,
  customer_id    uuid references auth.users (id) on delete set null,
  customer_name  text not null,
  customer_phone text,
  -- Snapshot of the line so editing a product never rewrites history.
  product_id     uuid references public.retailer_products (id) on delete set null,
  product_name   text not null,
  quantity       numeric(12,2) not null check (quantity > 0),
  unit           text not null default 'kg',
  amount_inr     numeric(12,2) not null check (amount_inr >= 0),
  cost_inr       numeric(12,2) not null default 0 check (cost_inr >= 0),
  payment_mode   text not null default 'cash'
                   check (payment_mode in ('cash','upi','card','credit')),
  status         text not null default 'processing'
                   check (status in ('processing','shipped','delivered','cancelled')),
  placed_at      timestamptz not null default now(),
  shipped_at     timestamptz,
  delivered_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists retailer_orders_owner_idx
  on public.retailer_orders (retailer_id, status, placed_at desc);
create index if not exists retailer_orders_date_idx
  on public.retailer_orders (retailer_id, placed_at);

-- ── Offers & discounts ─────────────────────────────────────────────────────
create table if not exists public.retailer_offers (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references auth.users (id) on delete cascade,
  title          text not null check (char_length(trim(title)) between 1 and 120),
  kind           text not null default 'discount'
                   check (kind in ('discount','coupon','festival','seasonal','combo')),
  code           text,
  discount_pct   numeric(5,2) check (discount_pct is null or (discount_pct > 0 and discount_pct <= 100)),
  flat_off_inr   numeric(12,2) check (flat_off_inr is null or flat_off_inr >= 0),
  min_order_inr  numeric(12,2) check (min_order_inr is null or min_order_inr >= 0),
  category       text,
  starts_on      date not null,
  ends_on        date not null,
  usage_limit    integer check (usage_limit is null or usage_limit > 0),
  used_count     integer not null default 0 check (used_count >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (discount_pct is not null or flat_off_inr is not null)
);
-- A coupon code is unique per shop, case-insensitively.
create unique index if not exists retailer_offers_code_idx
  on public.retailer_offers (retailer_id, upper(code))
  where code is not null;
-- One live offer cannot expire before it starts.
create index if not exists retailer_offers_window_idx
  on public.retailer_offers (retailer_id, is_active, ends_on);

-- ── Direct farmer procurement ──────────────────────────────────────────────
-- The retailer buys eligible agricultural products (produce, seed grain,
-- organic manure) straight from a farmer listing on the marketplace.
--
-- `listing_id` is a SOFT reference (plain uuid, no foreign key): the
-- marketplace table is created by features.sql, and this file must be runnable
-- even in a project where features.sql has not been applied yet. A missing
-- listing therefore never blocks procurement records or this script.
create table if not exists public.retailer_procurement (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references auth.users (id) on delete cascade,
  listing_id     uuid,
  farmer_id      uuid references auth.users (id) on delete set null,
  farmer_name    text,
  farmer_phone   text,
  product_name   text not null,
  quantity_kg    numeric(12,2) not null check (quantity_kg > 0),
  rate_inr       numeric(12,2) not null check (rate_inr >= 0),
  farmer_district text,
  status         text not null default 'requested'
                   check (status in ('requested','accepted','pickup_scheduled',
                                     'received','cancelled')),
  notes          text,
  requested_at   timestamptz not null default now(),
  received_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists retailer_procurement_owner_idx
  on public.retailer_procurement (retailer_id, status, requested_at desc);

-- ── Messages (retailer ↔ farmer / customer) ────────────────────────────────
create table if not exists public.retailer_messages (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references auth.users (id) on delete cascade,
  counterpart_id uuid references auth.users (id) on delete set null,
  counterpart_name text not null,
  counterpart_role text check (counterpart_role in ('Farmer','Buyer','Retailer','Other')),
  direction      text not null check (direction in ('in','out')),
  body           text not null check (char_length(body) between 1 and 2000),
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists retailer_messages_owner_idx
  on public.retailer_messages (retailer_id, created_at desc);

-- ── Notifications ──────────────────────────────────────────────────────────
-- Written by triggers below (and by the app), read by the dashboard bell.
create table if not exists public.retailer_notifications (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in
                   ('order','payment','low_stock','expiry','procurement','system')),
  title          text not null,
  body           text,
  link           text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists retailer_notifications_owner_idx
  on public.retailer_notifications (retailer_id, read_at, created_at desc);

-- ── Automatic alerts ───────────────────────────────────────────────────────
-- Low-stock: raises a notification when stock crosses the threshold, and
-- clears the unread one once the stock is replenished.
create or replace function public.retailer_low_stock_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_qty <= new.low_stock_at and (old.stock_qty > old.low_stock_at or old.stock_qty is null) then
    insert into public.retailer_notifications (retailer_id, kind, title, body, link)
    values (
      new.retailer_id,
      'low_stock',
      'Low stock: ' || new.name,
      format('Only %s %s left (alert below %s).', new.stock_qty, new.unit, new.low_stock_at),
      '/retailer/inventory'
    );
  elsif new.stock_qty > new.low_stock_at then
    delete from public.retailer_notifications
     where retailer_id = new.retailer_id
       and kind = 'low_stock'
       and read_at is null
       and title = 'Low stock: ' || new.name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retailer_low_stock on public.retailer_products;
create trigger trg_retailer_low_stock
  after update of stock_qty, low_stock_at on public.retailer_products
  for each row execute function public.retailer_low_stock_alert();

-- Expiry: fires for fertilisers and pesticides that are within 30 days.
create or replace function public.retailer_expiry_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expiry_date is not null and new.expiry_date <= current_date + 30 then
    insert into public.retailer_notifications (retailer_id, kind, title, body, link)
    values (
      new.retailer_id,
      'expiry',
      'Expiring soon: ' || new.name,
      format('Batch %s expires on %s.', coalesce(new.batch_no, '—'), new.expiry_date),
      '/retailer/inventory'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retailer_expiry on public.retailer_products;
create trigger trg_retailer_expiry
  after insert on public.retailer_products
  for each row execute function public.retailer_expiry_alert();

-- New customer order → notification.
create or replace function public.retailer_new_order_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.retailer_notifications (retailer_id, kind, title, body, link)
  values (
    new.retailer_id,
    case when new.payment_mode = 'credit' then 'payment' else 'order' end,
    'New order from ' || new.customer_name,
    format('%s × %s %s — ₹%s', new.product_name, new.quantity, new.unit, new.amount_inr),
    '/retailer/orders'
  );
  return new;
end;
$$;

drop trigger if exists trg_retailer_new_order on public.retailer_orders;
create trigger trg_retailer_new_order
  after insert on public.retailer_orders
  for each row execute function public.retailer_new_order_alert();

-- ── Row-level security ─────────────────────────────────────────────────────
-- Every retailer table is owner-only: retailers do not see each other's books.
alter table public.retailer_shops          enable row level security;
alter table public.retailer_products       enable row level security;
alter table public.retailer_orders         enable row level security;
alter table public.retailer_offers         enable row level security;
alter table public.retailer_procurement    enable row level security;
alter table public.retailer_messages       enable row level security;
alter table public.retailer_notifications  enable row level security;

drop policy if exists "Retailers manage their shop" on public.retailer_shops;
create policy "Retailers manage their shop" on public.retailer_shops
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- A verified shop is visible to any signed-in user so farmers can find a dealer.
drop policy if exists "Verified shops are browsable" on public.retailer_shops;
create policy "Verified shops are browsable" on public.retailer_shops
  for select using (verification = 'verified' or auth.uid() = owner_id);

drop policy if exists "Retailers manage their products" on public.retailer_products;
create policy "Retailers manage their products" on public.retailer_products
  for all using (auth.uid() = retailer_id) with check (auth.uid() = retailer_id);

drop policy if exists "Active products are browsable" on public.retailer_products;
create policy "Active products are browsable" on public.retailer_products
  for select using (status = 'active' or auth.uid() = retailer_id);

drop policy if exists "Retailers manage their orders" on public.retailer_orders;
create policy "Retailers manage their orders" on public.retailer_orders
  for all using (auth.uid() = retailer_id) with check (auth.uid() = retailer_id);

drop policy if exists "Customers read their own orders" on public.retailer_orders;
create policy "Customers read their own orders" on public.retailer_orders
  for select using (auth.uid() = customer_id);

drop policy if exists "Retailers manage their offers" on public.retailer_offers;
create policy "Retailers manage their offers" on public.retailer_offers
  for all using (auth.uid() = retailer_id) with check (auth.uid() = retailer_id);

drop policy if exists "Live offers are browsable" on public.retailer_offers;
create policy "Live offers are browsable" on public.retailer_offers
  for select using (is_active or auth.uid() = retailer_id);

drop policy if exists "Retailers manage their procurement" on public.retailer_procurement;
create policy "Retailers manage their procurement" on public.retailer_procurement
  for all using (auth.uid() = retailer_id) with check (auth.uid() = retailer_id);

drop policy if exists "Farmers see procurement requests for them" on public.retailer_procurement;
create policy "Farmers see procurement requests for them" on public.retailer_procurement
  for select using (auth.uid() = farmer_id);

drop policy if exists "Retailers manage their messages" on public.retailer_messages;
create policy "Retailers manage their messages" on public.retailer_messages
  for all using (auth.uid() = retailer_id) with check (auth.uid() = retailer_id);

drop policy if exists "Retailers manage their notifications" on public.retailer_notifications;
create policy "Retailers manage their notifications" on public.retailer_notifications
  for all using (auth.uid() = retailer_id) with check (auth.uid() = retailer_id);

-- ───────────────────────────────────────────────────────────────────────────
-- REQUIRED for new "Retailer" accounts.
--
-- `profiles_role_check` was created by schema.sql before the Retailer role
-- existed. Until the constraint below is replaced, signing up with
-- role = 'Retailer' fails with:
--   23514  new row for relation "profiles" violates check constraint
--          "profiles_role_check"
--
-- `Shop` is kept in the list so accounts registered under the old label keep
-- working; the app treats both as the same account type.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (
    role is null or role in (
      'Farmer', 'Buyer', 'Retailer', 'Shop', 'Worker',
      'Equipment', 'Transporter', 'Warehouse', 'Content Creator'
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Signup reliability: make sure every account knows its type.
--
-- Two separate bugs used to leave `profiles.role` empty even though the user
-- had picked an account type on the signup form:
--
--   1. The old handle_new_user() trigger copied role only on INSERT, never in
--      its ON CONFLICT DO UPDATE branch — so a row that already existed kept
--      a NULL role forever.
--   2. Accounts that had already signed up when that trigger was in place were
--      never repaired afterwards.
--
-- schema.sql now carries the fixed trigger. This block repairs existing rows
-- from `auth.users.raw_user_meta_data`, which is where the signup form writes
-- the chosen role.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Re-create the trigger function so its ON CONFLICT branch writes role.
--    (Same body as schema.sql — safe to re-run.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc jsonb := jsonb_strip_nulls(
    jsonb_build_object(
      'state',    nullif(trim(new.raw_user_meta_data ->> 'state'), ''),
      'district', nullif(trim(new.raw_user_meta_data ->> 'district'), ''),
      'village',  nullif(trim(new.raw_user_meta_data ->> 'village'), '')
    )
  );
begin
  insert into public.profiles (id, full_name, email, phone, role, avatar_url, details)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      nullif(split_part(new.email, '@', 1), '')
    ),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    new.raw_user_meta_data ->> 'role',
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    coalesce(new.raw_user_meta_data -> 'details', '{}'::jsonb) || coalesce(loc, '{}'::jsonb)
  )
  on conflict (id) do update
    set full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        email      = coalesce(excluded.email, public.profiles.email),
        phone      = coalesce(excluded.phone, public.profiles.phone),
        role       = coalesce(excluded.role, public.profiles.role),
        details    = public.profiles.details || coalesce(excluded.details, '{}'::jsonb);
  return new;
end;
$$;

-- 2. Backfill roles for accounts that never got one.
--    Only writes a value that is already a legal role, so the check
--    constraint can never be violated.
update public.profiles p
   set role = u.raw_user_meta_data ->> 'role'
  from auth.users u
 where p.id = u.id
   and p.role is null
   and (u.raw_user_meta_data ->> 'role') in (
         'Farmer', 'Buyer', 'Retailer', 'Shop', 'Worker',
         'Equipment', 'Transporter', 'Warehouse', 'Content Creator'
       );

-- 3. Create profile rows for any user that the trigger missed entirely.
insert into public.profiles (id, full_name, email, phone, role, avatar_url, details)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    nullif(split_part(u.email, '@', 1), '')
  ),
  u.email,
  nullif(u.raw_user_meta_data ->> 'phone', ''),
  case
    when (u.raw_user_meta_data ->> 'role') in (
      'Farmer', 'Buyer', 'Retailer', 'Shop', 'Worker',
      'Equipment', 'Transporter', 'Warehouse', 'Content Creator')
    then u.raw_user_meta_data ->> 'role'
  end,
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  jsonb_build_object(
    'state',    nullif(trim(u.raw_user_meta_data ->> 'state'), ''),
    'district', nullif(trim(u.raw_user_meta_data ->> 'district'), ''),
    'village',  nullif(trim(u.raw_user_meta_data ->> 'village'), '')
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 4. Report: every user and whether their account type is now known.
--    Run again after a test signup to confirm role is written immediately.
select
  u.email,
  coalesce(p.role, u.raw_user_meta_data ->> 'role') as account_type,
  case
    when p.id is null then 'missing profile'
    when p.role is null then 'NO ROLE — needs onboarding'
    else 'ok'
  end as status
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc
limit 20;
