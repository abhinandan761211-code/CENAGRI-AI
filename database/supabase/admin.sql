-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — Central Admin Panel
-- Run AFTER schema.sql, features.sql, creator.sql and retailer.sql.
-- Safe to re-run: every statement is idempotent.
--
-- Design notes (why these tables and not more):
--   • Accounts stay in `public.profiles` — there is no second user table.
--     Admin identity is an EXTRA role row keyed by the same auth.users id, so
--     an admin still signs in through the same Supabase Auth session.
--   • Roles and permissions are data, not code: `admin_role_permissions` is
--     the single source of truth the FastAPI layer reads on every request.
--     Change a mapping here and the API obeys it immediately.
--   • Every consequential action lands in `admin_audit_logs` — append-only,
--     written by the API, never by the browser.
--   • `profiles.account_status` is a soft lock (suspended / blocked). A row is
--     never hard-deleted by the panel; deletion requests are a recorded
--     workflow (`admin_deletion_requests`) so retention can be decided.
--   • No table here is readable by a normal authenticated user: RLS is on and
--     only `service_role` (the FastAPI backend) is granted access. The admin
--     UI never talks to these tables directly.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Account status on profiles ──────────────────────────────────────────
-- Additive only: existing rows default to 'active' and nothing else changes.
alter table public.profiles
  add column if not exists account_status text not null default 'active';
alter table public.profiles
  add column if not exists status_reason text;
alter table public.profiles
  add column if not exists status_changed_at timestamptz;
alter table public.profiles
  add column if not exists last_active_at timestamptz;

do $$
begin
  alter table public.profiles drop constraint if exists profiles_account_status_check;
  alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('active', 'pending', 'suspended', 'blocked'));
exception when others then null;
end $$;

create index if not exists idx_profiles_account_status on public.profiles (account_status);
create index if not exists idx_profiles_created_at on public.profiles (created_at desc);
create index if not exists idx_profiles_last_active on public.profiles (last_active_at desc nulls last);

-- ── 2. Admin roles ─────────────────────────────────────────────────────────
create table if not exists public.admin_roles (
  key          text primary key,
  label        text not null,
  description  text,
  -- Super Admin can never be locked out of role management by a mapping edit.
  is_system    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.admin_roles (key, label, description, is_system, sort_order) values
  ('super_admin',       'Super Admin',        'Full administrative access to every module.',                                   true, 1),
  ('admin',             'Admin',              'Day-to-day platform management across all business modules.',                   true, 2),
  ('moderator',         'Moderator',          'Reviews reported content and user behaviour.',                                  true, 3),
  ('support_manager',   'Support Manager',    'Handles support tickets, complaints and user follow-ups.',                      true, 4),
  ('content_moderator', 'Content Moderator',  'Reviews and moderates posts, photos, videos and comments.',                     true, 5),
  ('finance_manager',   'Finance Manager',    'Read access to orders, transactions and platform revenue.',                     true, 6),
  ('data_manager',      'Data Manager',       'Manages mandi, weather and crop agricultural datasets.',                        true, 7)
on conflict (key) do nothing;

-- ── 3. Permissions ─────────────────────────────────────────────────────────
create table if not exists public.admin_permissions (
  key          text primary key,
  module       text not null,
  label        text not null,
  description  text,
  -- Sensitive permissions additionally require a typed confirmation in the UI
  -- AND a reason in the audit log (suspension, refunds, role changes …).
  sensitive    boolean not null default false,
  sort_order   integer not null default 0
);

insert into public.admin_permissions (key, module, label, description, sensitive, sort_order) values
  ('dashboard.view',       'dashboard',    'View dashboard',            'See platform overview statistics.',                          false, 10),
  ('users.view',           'users',        'View users',                'Browse and inspect user accounts.',                          false, 20),
  ('users.moderate',       'users',        'Suspend / block users',     'Suspend, block and reactivate accounts.',                     true, 21),
  ('users.delete',         'users',        'Handle deletion requests',  'Approve or reject account deletion requests.',                true, 22),
  ('users.export',         'users',        'Export user records',       'Download authorised user data as CSV.',                       true, 23),
  ('kyc.view',             'kyc',          'View KYC requests',         'Review verification requests and identity documents.',        true, 30),
  ('kyc.review',           'kyc',          'Approve / reject KYC',      'Decide verification requests.',                               true, 31),
  ('roles.view',           'roles',        'View roles',                'See admin roles and permission mappings.',                   false, 40),
  ('roles.manage',         'roles',        'Manage roles',              'Assign admin roles and edit permission mappings.',            true, 41),
  ('content.view',         'content',      'View content',              'Browse creator content and comments.',                       false, 50),
  ('content.moderate',     'content',      'Moderate content',          'Approve, hide, remove or restore content.',                   true, 51),
  ('content.creator_manage','content',     'Verify creators',           'Approve or revoke creator verification.',                     true, 52),
  ('content.feature',      'content',      'Feature / trending',        'Control featured and trending content in the video hub.',     false, 53),
  ('hubs.view',            'video_hub',    'View video hub',            'See video, shorts and category management.',                 false, 55),
  ('marketplace.view',     'marketplace',  'View marketplace',          'Browse listings, sellers and product reports.',              false, 60),
  ('marketplace.moderate', 'marketplace',  'Moderate marketplace',      'Remove or restore listings and shop products.',               true, 61),
  ('orders.view',          'orders',        'View orders',               'See marketplace and retailer orders.',                       false, 65),
  ('orders.manage',        'orders',        'Manage order status',       'Advance or cancel orders.',                                  false, 66),
  ('finance.refund',       'finance',       'Adjust transactions',       'Refunds and payment adjustments.',                            true, 67),
  ('cenfriend.view',       'cenfriend',    'View CenFriend',            'Browse connections, service listings and reports.',          false, 70),
  ('cenfriend.moderate',   'cenfriend',    'Moderate CenFriend',        'Act on reported profiles and listings.',                      true, 71),
  ('agri_data.view',       'agri_data',    'View agricultural data',    'See mandi, weather and crop data configuration.',            false, 75),
  ('agri_data.manage',     'agri_data',    'Manage agricultural data',  'Sync, edit and configure mandi / weather / crop datasets.',   true, 76),
  ('ai.view',              'ai_services',  'View AI services',          'See AI provider health and usage (never the keys).',         false, 80),
  ('ai.manage',            'ai_services',  'Manage AI services',        'Change AI service limits and routing.',                       true, 81),
  ('analytics.view',       'analytics',    'View analytics',            'Platform analytics and reports.',                            false, 85),
  ('analytics.export',     'analytics',    'Export reports',            'Download analytics as CSV.',                                 true, 86),
  ('support.view',         'support',      'View tickets',              'See support tickets and complaints.',                        false, 90),
  ('support.manage',       'support',      'Manage tickets',            'Assign, reply to and resolve tickets.',                      false, 91),
  ('notifications.view',   'notifications','View announcements',        'See notification campaigns.',                                false, 95),
  ('notifications.manage', 'notifications','Send announcements',        'Create and send targeted announcements.',                    true, 96),
  ('cms.view',             'cms',          'View CMS content',          'See banners, pages and FAQs.',                               false, 100),
  ('cms.manage',           'cms',          'Manage CMS content',        'Edit CMS drafts and submit for approval.',                   false, 101),
  ('cms.publish',          'cms',          'Publish CMS content',       'Approve and publish CMS changes publicly.',                  true, 102),
  ('settings.view',        'settings',     'View platform settings',    'See configuration (secrets are never returned).',            false, 110),
  ('settings.manage',      'settings',     'Manage platform settings',  'Change configuration and feature flags.',                     true, 111),
  ('security.audit',       'security',     'View audit logs',           'Read the admin audit trail.',                                false, 120),
  ('system.health',        'system',       'View system health',        'See service health, backups and integrations.',              false, 130),
  ('system.maintenance',   'system',       'Maintenance mode',          'Turn the platform maintenance mode on or off.',               true, 131)
on conflict (key) do nothing;

-- ── 4. Role → permission mapping ───────────────────────────────────────────
create table if not exists public.admin_role_permissions (
  role_key        text not null references public.admin_roles (key) on delete cascade,
  permission_key  text not null references public.admin_permissions (key) on delete cascade,
  granted_at      timestamptz not null default now(),
  primary key (role_key, permission_key)
);

-- Least privilege: each role gets what its job actually needs.
insert into public.admin_role_permissions (role_key, permission_key)
select 'super_admin', key from public.admin_permissions
on conflict do nothing;

insert into public.admin_role_permissions (role_key, permission_key) values
  ('admin', 'dashboard.view'), ('admin', 'users.view'), ('admin', 'users.moderate'),
  ('admin', 'kyc.view'), ('admin', 'kyc.review'), ('admin', 'content.view'),
  ('admin', 'content.moderate'), ('admin', 'content.feature'),
  ('admin', 'hubs.view'), ('admin', 'marketplace.view'),
  ('admin', 'orders.view'), ('admin', 'orders.manage'),
  ('admin', 'cenfriend.view'), ('admin', 'cenfriend.moderate'),
  ('admin', 'agri_data.view'), ('admin', 'ai.view'), ('admin', 'ai.manage'),
  ('admin', 'analytics.view'), ('admin', 'support.view'), ('admin', 'support.manage'),
  ('admin', 'notifications.view'), ('admin', 'notifications.manage'),
  ('admin', 'cms.view'), ('admin', 'cms.manage'), ('admin', 'settings.view'),
  ('admin', 'system.health'),
  ('moderator', 'dashboard.view'), ('moderator', 'users.view'),
  ('moderator', 'content.view'), ('moderator', 'content.moderate'),
  ('moderator', 'cenfriend.view'), ('moderator', 'cenfriend.moderate'),
  ('moderator', 'hubs.view'),
  ('support_manager', 'dashboard.view'), ('support_manager', 'users.view'),
  ('support_manager', 'kyc.view'), ('support_manager', 'support.view'),
  ('support_manager', 'support.manage'), ('support_manager', 'notifications.view'),
  ('support_manager', 'orders.view'), ('support_manager', 'marketplace.view'),
  ('content_moderator', 'dashboard.view'), ('content_moderator', 'content.view'),
  ('content_moderator', 'content.moderate'), ('content_moderator', 'content.feature'),
  ('content_moderator', 'hubs.view'), ('content_moderator', 'marketplace.view'),
  ('content_moderator', 'marketplace.moderate'), ('content_moderator', 'cms.view'),
  ('finance_manager', 'dashboard.view'), ('finance_manager', 'orders.view'),
  ('finance_manager', 'finance.refund'), ('finance_manager', 'analytics.view'),
  ('finance_manager', 'analytics.export'), ('finance_manager', 'marketplace.view'),
  ('data_manager', 'dashboard.view'), ('data_manager', 'agri_data.view'),
  ('data_manager', 'agri_data.manage'), ('data_manager', 'analytics.view'),
  ('data_manager', 'analytics.export'), ('data_manager', 'ai.view')
on conflict do nothing;

-- ── 5. Admin users (1 row per admin) ───────────────────────────────────────
create table if not exists public.admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role_key     text not null references public.admin_roles (key) on delete restrict,
  is_active    boolean not null default true,
  -- Optional per-admin extra grants on top of the role (never wider than role
  -- for sensitive permissions without a Super Admin recording the reason).
  extra_permissions text[] not null default '{}'::text[],
  -- MFA state, enforced by the backend once the admin enrols a factor.
  mfa_required boolean not null default false,
  mfa_enrolled_at timestamptz,
  notes        text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists admin_users_role_idx on public.admin_users (role_key);

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at
  before update on public.admin_users
  for each row execute function public.touch_updated_at();

-- ── 6. Audit log (append-only) ─────────────────────────────────────────────
create table if not exists public.admin_audit_logs (
  id            bigserial primary key,
  admin_id      uuid references auth.users (id) on delete set null,
  admin_email   text,
  admin_role    text,
  action        text not null,
  module        text not null,
  target_type   text,
  target_id     text,
  reason        text,
  -- Before/after snapshots are sanitised by the API: secrets and identity
  -- document contents are never written here.
  before_state  jsonb,
  after_state   jsonb,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_module_idx on public.admin_audit_logs (module, created_at desc);
create index if not exists admin_audit_admin_idx on public.admin_audit_logs (admin_id, created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_logs (target_type, target_id);

-- ── 7. KYC / verification requests ─────────────────────────────────────────
create table if not exists public.admin_kyc_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_type   text,
  document_type  text not null check (document_type in
                   ('aadhaar', 'pan', 'gst', 'licence', 'land_record', 'shop_licence', 'other')),
  document_url   text not null,
  document_hint  text,
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  reason         text,
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists admin_kyc_status_idx on public.admin_kyc_requests (status, created_at desc);
create index if not exists admin_kyc_user_idx on public.admin_kyc_requests (user_id);

-- ── 8. Moderation actions (content, marketplace, community) ────────────────
create table if not exists public.moderation_actions (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in
                  ('video', 'comment', 'post', 'listing', 'product', 'profile')),
  entity_id     text not null,
  action        text not null check (action in
                  ('approve', 'reject', 'hide', 'remove', 'restore', 'restrict', 'feature', 'unfeature')),
  reason        text,
  admin_id      uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists moderation_entity_idx on public.moderation_actions (entity_type, entity_id, created_at desc);
create index if not exists moderation_admin_idx on public.moderation_actions (admin_id, created_at desc);

-- Editorial flags that the public video hub reads.
alter table public.videos add column if not exists is_featured boolean not null default false;
alter table public.videos add column if not exists is_hidden boolean not null default false;
create index if not exists videos_featured_idx on public.videos (is_featured, published_at desc);

-- ── 9. Support tickets ─────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable: complaints can arrive from the public contact form.
  user_id       uuid references auth.users (id) on delete set null,
  contact_email text,
  subject       text not null,
  category      text not null default 'general'
                  check (category in ('general', 'account', 'order', 'payment', 'content', 'kyc', 'bug', 'other')),
  priority      text not null default 'normal'
                  check (priority in ('low', 'normal', 'high', 'urgent')),
  status        text not null default 'open'
                  check (status in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  assigned_to   uuid references auth.users (id) on delete set null,
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists support_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_assignee_idx on public.support_tickets (assigned_to, created_at desc);
create index if not exists support_user_idx on public.support_tickets (user_id, created_at desc);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_kind text not null check (author_kind in ('user', 'admin')),
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  -- Internal notes are never shown to the user who opened the ticket.
  is_internal boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_updated_at();

-- ── 10. Platform settings + feature flags ──────────────────────────────────
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  category    text not null default 'general',
  label       text,
  -- A `secret` setting's value is write-only: the API returns a masked string.
  kind        text not null default 'text'
                check (kind in ('text', 'number', 'boolean', 'json', 'secret', 'url', 'select')),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key          text primary key,
  description  text,
  enabled      boolean not null default false,
  payload      jsonb,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- ── 11. Notification campaigns ─────────────────────────────────────────────
create table if not exists public.notification_campaigns (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text not null,
  channel        text not null default 'in_app'
                   check (channel in ('in_app', 'email', 'push')),
  audience_roles text[] not null default '{}'::text[],
  audience_states text[] not null default '{}'::text[],
  status         text not null default 'draft'
                   check (status in ('draft', 'scheduled', 'sent', 'cancelled')),
  scheduled_at   timestamptz,
  sent_at        timestamptz,
  recipient_count integer,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists campaigns_status_idx on public.notification_campaigns (status, created_at desc);

-- ── 12. Deletion requests (controlled workflow) ────────────────────────────
create table if not exists public.admin_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  reason       text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'completed')),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz not null default now()
);

create index if not exists deletion_status_idx on public.admin_deletion_requests (status, created_at desc);

-- ── 13. CMS pages (draft → review → published) ─────────────────────────────
create table if not exists public.cms_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  kind         text not null default 'page'
                 check (kind in ('banner', 'page', 'faq', 'terms', 'privacy', 'education')),
  content      text not null default '',
  status       text not null default 'draft'
                 check (status in ('draft', 'review', 'published', 'archived')),
  published_at timestamptz,
  updated_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_cms_pages_updated_at on public.cms_pages;
create trigger trg_cms_pages_updated_at
  before update on public.cms_pages
  for each row execute function public.touch_updated_at();

-- ── 14. Lock everything down ───────────────────────────────────────────────
-- RLS on, and no policy for `authenticated`/`anon`: only the backend
-- (service role, which bypasses RLS) can read or write these tables. This is
-- what stops an ordinary user from querying admin data with their session.
do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_roles', 'admin_permissions', 'admin_role_permissions', 'admin_users',
    'admin_audit_logs', 'admin_kyc_requests', 'moderation_actions',
    'support_tickets', 'support_messages', 'platform_settings', 'feature_flags',
    'notification_campaigns', 'admin_deletion_requests', 'cms_pages'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant all on public.admin_audit_logs to service_role;
grant usage, select on sequence public.admin_audit_logs_id_seq to service_role;

-- ── 15. First Super Admin ──────────────────────────────────────────────────
-- Accounts are created only through the normal Supabase signup. To make one an
-- admin, run this with that account's real id (Auth → Users → copy UUID):
--
--   insert into public.admin_users (user_id, role_key)
--   values ('00000000-0000-0000-0000-000000000000', 'super_admin')
--   on conflict (user_id) do update set role_key = excluded.role_key, is_active = true;
--
-- Never add an admin row for an account that was not created through the
-- normal signup flow — the backend trusts the session, not this table alone.
