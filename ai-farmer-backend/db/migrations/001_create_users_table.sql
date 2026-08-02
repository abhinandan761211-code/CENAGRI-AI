-- Creates users table for auth
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  hashed_password text,
  full_name text,
  created_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users(email);

select table_schema, table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'users';