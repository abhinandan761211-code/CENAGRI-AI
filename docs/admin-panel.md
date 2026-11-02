# Central Admin Panel — setup, architecture and operating notes

The admin panel lives inside the existing app at **`/admin`**. It reuses the
existing Supabase accounts, the existing creator/marketplace/community tables
and the existing FastAPI service. There is no second user system, no second
database, and no second login.

---

## 1. What is where

| Layer | Path | Notes |
|---|---|---|
| Database | `database/supabase/admin.sql` | Additive, idempotent. Roles, permissions, audit log, KYC, tickets, settings, flags, CMS, deletion requests. |
| Seed | `database/supabase/admin_seed.sql` | Settings catalogue + feature flags. Run after `admin.sql`. |
| Storage | `database/supabase/admin_storage.sql` | Private `kyc-documents` bucket. |
| API | `backend/app/api/v1/admin/*` | Mounted at `/api/v1/admin` **only** when the service role is configured. |
| Security | `backend/app/core/security.py` | JWT verification, admin resolution, permission gates, rate limit. |
| Data access | `backend/app/db/admin_store.py` | Service-role PostgREST client. |
| UI | `frontend/src/pages/admin/*`, `frontend/src/components/admin/*` | 20 modules, one `AdminLayout`. |
| Tests | `backend/tests/test_admin_security.py` | RBAC, token and audit-sanitisation tests. |

---

## 2. Setup

### 2.1 Database

Run, in this order, in the Supabase SQL editor:

```
schema.sql  →  features.sql  →  creator.sql  →  retailer.sql
            →  admin.sql  →  admin_seed.sql  →  admin_storage.sql
```

Every file is safe to re-run. `admin.sql` adds columns to `public.profiles`
(`account_status`, `status_reason`, `status_changed_at`, `last_active_at`) and
two flags to `public.videos` (`is_featured`, `is_hidden`); it drops nothing.

### 2.2 Promote the first Super Admin

Create the account through the **normal signup flow** (so `auth.users` and
`public.profiles` both exist for it), sign in once in the app, then look the id up:

```sql
select id, email, created_at from auth.users where email = 'you@example.com';
```

and promote it:

```sql
insert into public.admin_users (user_id, role_key)
values ('<auth.users.id of that account>', 'super_admin')
on conflict (user_id) do update
  set role_key = excluded.role_key, is_active = true;

-- confirm
select user_id, role_key, is_active from public.admin_users;
```

Repeat with `role_key = 'moderator' | 'support_manager' | …` for other admins.
Only a Super Admin can change roles or permissions afterwards.

### 2.2b Verify

From the repo root:

```bash
backend/.venv/bin/python scripts/check_admin_setup.py
```

It reads only, and names whichever step is still missing: env config → tables
present → active `super_admin` row → admin router mounted.

### 2.3 Backend environment

Add to `backend/.env` (never commit the values) — `backend/.env.example` has
the full block ready to copy:

```dotenv
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
# One of these two verifies Supabase session tokens:
SUPABASE_JWT_SECRET=<legacy JWT secret>        # HS256 projects
# Modern projects publish JWKS at /auth/v1/.well-known/jwks.json — that path is
# derived from SUPABASE_URL automatically.
SUPABASE_JWT_AUDIENCE=authenticated
ADMIN_SESSION_MAX_MINUTES=480
ADMIN_MFA_REQUIRED=false
ADMIN_RATE_LIMIT_PER_MINUTE=240
```

With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + a signing secret unset, the
admin router is **not mounted at all** — the panel fails closed with a 404
rather than starting in an insecure state.

### 2.4 Frontend

Nothing to configure. The client calls `/api/v1/admin` through the existing Vite
dev proxy (`vite.config.ts`). Set `VITE_API_BASE_URL` if the API is on another
origin.

---

## 3. Security model

**The browser is never believed.** The only thing it sends is its Supabase
access token. `require_admin` then:

1. verifies the token signature (JWKS or the legacy HS256 secret), issuer,
   audience and expiry;
2. rejects a session older than `ADMIN_SESSION_MAX_MINUTES`;
3. looks the account up in `admin_users` — no row, no access (403);
4. loads that role's permission set from `admin_role_permissions`;
5. enforces `ADMIN_MFA_REQUIRED` against the token's `aal`;
6. throttles per admin.

Every route carries `require_permission("…")`, so a moderator calling a
suspension endpoint gets 403 even if they hand-craft the request. The frontend's
`can()` helper only hides buttons.

**What is recorded.** Every consequential write goes through
`app.core.security.audit(...)` → `admin_audit_logs`:

admin id · email · role · action · module · target type/id · reason ·
before/after snapshot · IP · user agent · timestamp.

Snapshots are sanitised (`_safe_json`) — password/token/secret/`*_key` fields
and `document_url` never reach the table. Audit rows have no update or delete
route anywhere in the API.

**Sensitive actions** additionally require a typed confirmation or a minimum
reason length:

| Action | Extra requirement |
|---|---|
| Change account status | Type the account's email |
| Refund | Reason ≥ 10 characters, capped at the order total |
| KYC reject | Reason required |
| Role / permission change | Super Admin + reason |
| Settings, feature flags, CMS publish | Reason |
| Deletion decision | Reason; `approve` only marks it for the retention job |

**Secrets.** Platform settings of `kind = 'secret'` are write-only: the API
returns a mask, and a blank submit means "leave unchanged". Provider keys live
only in server environment variables and are reported as `configured: true/false`.

**Identity documents** are in a private bucket. `GET /kyc/{id}/document` returns
a signed URL valid for five minutes and audits the access.

---

## 4. Modules

| Route | Module | Permission(s) |
|---|---|---|
| `/admin` | Dashboard | `dashboard.view` |
| `/admin/users` | User management, CSV export, deletion requests | `users.view` · `users.moderate` · `users.export` · `users.delete` |
| `/admin/roles` | Roles, permission matrix, admin users | `roles.view` · `roles.manage` |
| `/admin/kyc` | Verification queue and document review | `kyc.view`, `kyc.review` (signed URLs need `kyc.view`) |
| `/admin/content` | Videos, reports, comments, posts | `content.view` · `content.moderate` |
| `/admin/video-hub` | Catalogue and featured placement | `hubs.view` · `content.feature` |
| `/admin/creators` | Creator channels and verification | `content.view` · `content.creator_manage` |
| `/admin/marketplace` | Listings and shop products | `marketplace.view` · `marketplace.moderate` |
| `/admin/cenfriend` | Connections and service listings | `cenfriend.view` · `cenfriend.moderate` |
| `/admin/orders` | Orders, status, refunds | `orders.view` · `orders.manage` · `finance.refund` |
| `/admin/agri-data` | Mandi feed status and live check | `agri_data.view` · `agri_data.manage` |
| `/admin/weather` | Weather integration status | `agri_data.view` |
| `/admin/ai-services` | Provider health and latency | `ai.view` · `ai.manage` |
| `/admin/analytics` | Reports and CSV export | `analytics.view` · `analytics.export` |
| `/admin/support` | Tickets, replies, internal notes | `support.view` · `support.manage` |
| `/admin/notifications` | Announcement campaigns | `notifications.view` · `notifications.manage` |
| `/admin/cms` | Pages with draft → review → published | `cms.view` · `cms.manage` · `cms.publish` |
| `/admin/settings` | Settings and feature flags | `settings.view` · `settings.manage` |
| `/admin/security` | Audit log (read-only) | `security.audit` |
| `/admin/health` | Service health | `system.health` |

---

## 5. Honest limitations

These are deliberate, not unfinished business dressed up as features:

- **Weather is not integrated.** `/agri/weather/status` says
  `capability: "not_integrated"`. The page shows that fact rather than an empty
  "0 alerts" dashboard.
- **Mandi prices are not stored.** The app fetches `data.gov.in` live with an
  in-memory cache. The status endpoint reports `storage.available: false` and
  the UI says so. If you later add a `mandi_prices` table, the status endpoint
  picks it up with no code change.
- **Refunds on retailer orders are audit-only.** That table has no refund
  column; the API records the decision and returns
  `order_updated: false` with an explanation.
- **Sending an announcement is not wired to a delivery worker.** Campaigns are
  created as `draft`/`scheduled`; delivery is a background job that belongs to
  the notification service, not to a request handler.
- **Playlists and watch history** do not exist in the schema; the panel does not
  invent them.
- **Rate limiting is per process.** One API instance is fine; several instances
  need a shared Redis counter.
- **MFA** is enforced from the token's `aal` when `ADMIN_MFA_REQUIRED=true`.
  Enrolment itself happens in Supabase Auth or the app's own MFA screen.

Every nullable counter in the dashboard renders as an em dash (`—`), never as
`0`: "this table is not installed" and "there is no data" must not look alike to
an administrator.

---

## 6. Scaling notes

- Lists are paginated server-side (`page`, `page_size`, max 100) with exact
  counts via PostgREST's `content-range`.
- The indexes that matter are created in `admin.sql`: profile status/created
  date, audit by module/admin/target, KYC status, ticket status/assignee,
  moderation by entity.
- Dashboard aggregates are simple counts; if they get expensive at 1 crore
  users, materialise them into a `admin_dashboard_cache` table refreshed by a
  job — the endpoint already returns a `generated_at`, so the UI can show age.
- Exports stream CSV row by row; large exports should move to a background job
  that writes to object storage and emails a link.
- The admin panel is a modular monolith with the rest of the API. Do not split
  it out until a real scaling constraint demands it.

---

## 7. Tests

```bash
cd backend
.venv/bin/python -m pytest tests/test_admin_security.py -q
```

Covers: wrong-secret token, wrong audience, expired token, stale admin session,
a normal user without an admin row (403), a disabled admin (403), a moderator
holding one permission but refused another, a missing token (401), a malformed
header (401), audit sanitisation, and permission-cache invalidation after a
role change.

Frontend: `npx tsc --noEmit` and `npx vite build` both pass; every admin screen
was rendered in the QA harness (`vite.qa.config.ts`) with console and network
error monitoring — no errors.

---

## 8. Rollback

`admin.sql` only adds. To remove the panel entirely:

```sql
drop table if exists public.cms_pages, public.admin_deletion_requests,
  public.notification_campaigns, public.feature_flags, public.platform_settings,
  public.support_messages, public.support_tickets, public.moderation_actions,
  public.admin_kyc_requests, public.admin_audit_logs, public.admin_users,
  public.admin_role_permissions, public.admin_permissions, public.admin_roles
  cascade;
alter table public.videos drop column if exists is_hidden, drop column if exists is_featured;
-- profiles columns are left in place: the app keeps working without them.
```

And remove the `SUPABASE_*` admin variables from `backend/.env` — the router
stops being mounted.
