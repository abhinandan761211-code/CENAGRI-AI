-- ───────────────────────────────────────────────────────────────────────────
-- CenAGRI-AI — seed data for the admin panel
-- Run AFTER database/supabase/admin.sql. Safe to re-run.
--
-- Only reference data lives here: settings keys and feature flags. Nothing in
-- this file creates an account, an admin, or platform content.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Settings catalogue ─────────────────────────────────────────────────────
-- `kind` drives the form control AND the API's treatment:
--   text | number | boolean | json | url | select  → read/write
--   secret                                        → write-only, masked on read
insert into public.platform_settings (key, value, category, label, kind) values
  -- General
  ('platform.name',        '"CenAGRI AI"'::jsonb,      'general',       'Platform name',                'text'),
  ('platform.tagline',     '"Agriculture super app"'::jsonb, 'general', 'Tagline',                      'text'),
  ('platform.support_email', '"support@cenagri.ai"'::jsonb, 'general', 'Support email',                'text'),
  ('platform.timezone',    '"Asia/Kolkata"'::jsonb,    'general',       'Default timezone',             'text'),
  -- Localization
  ('locale.default',       '"en"'::jsonb,              'localization',  'Default language',             'select'),
  ('locale.enabled',       '["en","hi","or","bn"]'::jsonb, 'localization', 'Enabled languages',         'json'),
  -- Registration
  ('registration.enabled', 'true'::jsonb,              'registration',  'Allow new signups',            'boolean'),
  ('registration.require_email_verification', 'true'::jsonb, 'registration', 'Require email verification', 'boolean'),
  ('registration.require_phone_verification', 'false'::jsonb, 'registration', 'Require phone verification', 'boolean'),
  ('registration.require_approval', 'false'::jsonb,    'registration',  'Admin must approve new accounts', 'boolean'),
  ('registration.account_types', '["Farmer","Buyer","Retailer","Worker","Transporter","Equipment","Warehouse","Content Creator"]'::jsonb, 'registration', 'Allowed account types', 'json'),
  -- Agriculture
  ('agriculture.seasons',  '["Kharif","Rabi","Zaid"]'::jsonb, 'agriculture', 'Crop seasons',             'json'),
  ('agriculture.default_state', '"Chhattisgarh"'::jsonb, 'agriculture',  'Default state',                'text'),
  -- Content
  ('content.allowed_image_types', '["jpg","jpeg","png","webp"]'::jsonb, 'content', 'Allowed image types', 'json'),
  ('content.allowed_video_types', '["mp4","mov","webm"]'::jsonb, 'content', 'Allowed video types',      'json'),
  ('content.max_video_mb', '512'::jsonb,               'content',       'Max video size (MB)',          'number'),
  ('content.max_video_minutes', '30'::jsonb,           'content',       'Max video length (minutes)',   'number'),
  -- Integrations: keys are secrets, the rest is configuration.
  ('integrations.weather_provider', '""'::jsonb,       'integrations',  'Weather provider',             'text'),
  ('integrations.weather_api_key', '""'::jsonb,        'integrations',  'Weather API key',              'secret'),
  ('integrations.push_provider', '""'::jsonb,          'integrations',  'Push notification provider',   'text'),
  ('integrations.push_key', '""'::jsonb,               'integrations',  'Push server key',              'secret'),
  ('integrations.email_provider', '""'::jsonb,         'integrations',  'Email provider',               'text'),
  ('integrations.email_key', '""'::jsonb,              'integrations',  'Email provider key',           'secret'),
  ('integrations.storage_provider', '"supabase"'::jsonb, 'integrations', 'Object storage provider',     'text'),
  -- Security (mirrors the server config; the server remains the authority)
  ('security.admin_mfa_required', 'false'::jsonb,      'security',      'Admin MFA required',           'boolean'),
  ('security.session_max_minutes', '480'::jsonb,       'security',      'Admin session max (minutes)',  'number'),
  ('security.rate_limit_per_minute', '240'::jsonb,     'security',      'Admin API requests / minute',  'number'),
  ('security.password_min_length', '8'::jsonb,         'security',      'Minimum password length',      'number'),
  -- System
  ('system.maintenance_mode', 'false'::jsonb,          'system',        'Maintenance mode',             'boolean'),
  ('system.maintenance_message', '"CenAGRI is being updated. Please check back shortly."'::jsonb, 'system', 'Maintenance message', 'text')
on conflict (key) do nothing;

-- ── Feature flags ──────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled) values
  ('video_hub.live',        'Show the live streaming row in Kisan Video Hub', false),
  ('video_hub.uploads_open', 'Allow creators to upload without channel approval', true),
  ('marketplace.bidding',   'Enable price offers on listings', false),
  ('cenfriend.messaging',   'In-app messaging between connections', false),
  ('ai.advisory_llm',       'Use the LLM advisor (falls back to rules when off)', false)
on conflict (key) do nothing;

-- ── Nothing else ───────────────────────────────────────────────────────────
-- Deliberately no admin_users row here: promoting a real account is a decision
-- that belongs to the operator, with that account's real UUID. See the
-- commented block at the bottom of admin.sql.
