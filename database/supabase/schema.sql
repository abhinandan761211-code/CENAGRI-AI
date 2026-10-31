-- ─────────────────────────────────────────────────────────────
-- CenAGRI-AI — Supabase schema
-- Run this in Supabase Studio → SQL Editor (or `supabase db push`).
-- Safe to re-run: every statement is idempotent.
-- ─────────────────────────────────────────────────────────────

-- 1. Profiles: one row per auth.users row ------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  role        text check (
    role is null or role in (
      'Farmer', 'Buyer', 'Shop', 'Worker',
      'Equipment', 'Transporter', 'Warehouse', 'Content Creator'
    )
  ),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles (role);

-- 2. Keep updated_at fresh ---------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 3. Create a profile automatically for every new user ------------
--    Works for email signup AND Google OAuth (metadata comes from
--    raw_user_meta_data: full_name / name / picture / avatar_url).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role, avatar_url)
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
    )
  )
  on conflict (id) do update
    set full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        email      = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Row Level Security -------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Profiles are deletable by owner" on public.profiles;
create policy "Profiles are deletable by owner"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = id);

-- 5. Farms (kept in Supabase instead of a self-hosted Postgres) ---
create table if not exists public.farms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  location    text,
  area_ha     numeric(12, 2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_farms_owner on public.farms (owner_id);

drop trigger if exists trg_farms_updated_at on public.farms;
create trigger trg_farms_updated_at
  before update on public.farms
  for each row execute function public.touch_updated_at();

alter table public.farms enable row level security;

drop policy if exists "Farms are managed by owner" on public.farms;
create policy "Farms are managed by owner"
  on public.farms for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
