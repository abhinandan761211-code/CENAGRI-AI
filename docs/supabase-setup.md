# Supabase setup (auth + database)

Everything below is one-time manual work in the Supabase dashboard. The frontend
code is already wired — you only provide credentials and click a few toggles.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users (for West Bengal: **Mumbai / Singapore**).
3. Save the database password somewhere safe.

## 2. Copy the keys

**Project Settings → API**

| Value | Where it goes |
|-------|---------------|
| Project URL (`https://xxxx.supabase.co`) | `VITE_SUPABASE_URL` |
| `anon` / `public` key | `VITE_SUPABASE_ANON_KEY` |

> The anon key is safe to ship in the browser — **never** put the `service_role`
> key in the frontend or commit it to git.

Local dev:

```bash
cp frontend/.env.example frontend/.env
# paste the two values, keep VITE_SITE_URL=http://localhost:5173
```

Vercel / Netlify: add the same keys as environment variables, with
`VITE_SITE_URL` set to the deployed URL (e.g. `https://cenagri-ai.vercel.app`).

## 3. Create the tables

Open **SQL Editor** → New query → paste the whole of
[`database/supabase/schema.sql`](../database/supabase/schema.sql) → **Run**.

This creates:

- `public.profiles` — one row per user (name, email, phone, role, avatar)
- a trigger that fills the profile automatically on signup (email **and** Google)
- `public.farms` — owner-scoped farm records
- Row Level Security so a user can only read/write their own rows

## 4. Enable Email signup

**Authentication → Providers → Email**

- Email provider: **enabled**
- **Confirm email**: ON for production (users get a verification link).
  Turn it OFF for a frictionless local demo.

**Authentication → URL Configuration**

- **Site URL**: `http://localhost:5173` (dev) or your production domain
- **Redirect URLs** (add all you use):
  - `http://localhost:5173/**`
  - `https://your-domain.com/**`

The app redirects back to `/auth/callback`, which is covered by the `/**` rules.

## 5. Enable Google sign-in

### a. Google Cloud Console

1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name,
   support email → save. Add yourself as a test user while in *Testing* mode.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins**
     - `http://localhost:5173`
     - `https://your-domain.com`
   - **Authorized redirect URI** (this is Supabase, not your app):
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret**.

### b. Supabase dashboard

**Authentication → Providers → Google** → enable, paste Client ID + Secret → Save.
Copy the callback URL shown there into the *Authorized redirect URI* list above.

Done — the "Continue with Google" button on `/login` and `/signup` now works for
both local and production URLs (as long as they are in **Redirect URLs**).

## 6. Password reset

Works out of the box: `/forgot-password` sends a reset mail, the link opens
`/reset-password` where the user sets a new password.

Customise the email under **Authentication → Email Templates → Reset Password**
and make sure the link uses `{{ .ConfirmationURL }}`.

## 7. Verify

```bash
cd frontend && npm run dev
```

- Sign up with email → check your inbox → confirm → sign in.
- Sign up with Google → lands on `/dashboard`.
- Refresh `/dashboard` → session persists.
- Sign out → `/dashboard` redirects to `/login?redirect=/dashboard`.

### Common errors

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` (Google) | Add the exact URL to Authorized JavaScript origins / redirect URIs |
| `Invalid login credentials` | Wrong password, or email not confirmed yet |
| `Email not confirmed` | Click the confirmation link, or disable *Confirm email* |
| Profile stays empty | Re-run `database/supabase/schema.sql` (trigger + RLS) |
| Google button does nothing | `frontend/.env` missing keys → restart `npm run dev` |
