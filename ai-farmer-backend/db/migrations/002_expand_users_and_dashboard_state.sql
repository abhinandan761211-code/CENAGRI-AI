-- 002_expand_users_and_dashboard_state.sql
-- Aligns Supabase schema with backend auth expectations.

-- Ensure users table has required columns used by backend payloads.
alter table if exists public.users
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists password text,
  add column if not exists user_type text default 'farmer',
  add column if not exists business_name text,
  add column if not exists location text,
  add column if not exists gst_number text,
  add column if not exists vehicle_type text,
  add column if not exists license_number text,
  add column if not exists store_type text,
  add column if not exists farm_size numeric,
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

-- Backfill from minimal schema fields where possible.
update public.users
set
  name = coalesce(nullif(name, ''), full_name),
  password = coalesce(nullif(password, ''), hashed_password),
  user_type = coalesce(nullif(user_type, ''), 'farmer'),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, now())
where true;

-- Keep useful constraints/indexes.
create unique index if not exists users_email_unique_idx on public.users (lower(email));
create index if not exists users_user_type_idx on public.users (user_type);

-- Table used by backend for auth audit and admin/network settings payloads.
create table if not exists public.dashboard_state (
  id bigserial primary key,
  scope text not null unique,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists dashboard_state_scope_idx on public.dashboard_state (scope);
