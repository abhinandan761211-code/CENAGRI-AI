-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — signup diagnosis
--
-- Run this in Supabase → SQL Editor and read the output. It answers one
-- question: "after signup, does the database know which account type the user
-- picked?" Nothing here changes data.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. How many auth users exist, and how many have a profile row?
--    A gap here means the signup trigger is failing.
select
  (select count(*) from auth.users)                      as auth_users,
  (select count(*) from public.profiles)                 as profile_rows,
  (select count(*) from public.profiles where role is not null) as profiles_with_role,
  (select count(*) from public.profiles where role is null)     as profiles_missing_role;

-- 2. The 10 newest users side by side with their profile row.
--    "profile_role" NULL while "signup_role" is set = the bug.
select
  u.created_at,
  u.email,
  u.raw_user_meta_data ->> 'role' as signup_role,
  p.role                          as profile_role,
  p.full_name,
  case
    when p.id is null then 'NO PROFILE ROW'
    when p.role is null then 'PROFILE WITHOUT ROLE'
    else 'ok'
  end as status
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc
limit 10;

-- 3. Is the trigger actually attached?
select tgname as trigger_name, tgenabled as enabled
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;

-- 4. Does the current role check constraint accept every account type?
select pg_get_constraintdef(oid) as role_constraint
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and conname = 'profiles_role_check';
