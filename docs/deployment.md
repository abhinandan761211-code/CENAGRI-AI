# Deployment

The frontend is a static Vite build; auth + database live in Supabase, so most
deploys need **no backend at all**.

## Required environment variables

| Variable | Example | Notes |
|----------|---------|-------|
| `VITE_SUPABASE_URL` | `https://abcd.supabase.co` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi…` | public key, safe in the browser |
| `VITE_SITE_URL` | `https://cenagri-ai.vercel.app` | used for OAuth/email redirects |
| `VITE_API_BASE_URL` | `https://api.cenagri.ai/api/v1` | optional, when the FastAPI backend is live |

After the first deploy, add the production domain to Supabase
**Authentication → URL Configuration → Site URL + Redirect URLs**.

---

## Netlify (frontend) + Render (backend)

This is the production setup. The frontend is a static build; the FastAPI
backend runs in a Docker container.

### 1. Backend on Render

1. Push the repo to GitHub.
2. Render → **New +** → **Blueprint** → pick the repo. `render.yaml` is read
   automatically and creates the `cenagri-api` service.
3. Fill the secrets Render prompts for (`sync: false`): `DATABASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
   `DATA_GOV_API_KEY`, `LLM_API_KEY`, `CORS_ORIGINS`.
4. Wait for the deploy. `GET https://<service>.onrender.com/health` must return
   `{"status":"ok"}`. If it fails, the container is not listening on `$PORT` —
   `backend/Dockerfile` reads it, so check the Render log for a startup crash.

> **Free plan sleeps after 15 minutes idle.** The first request then takes
> ~30–50 s to wake. That is Render's behaviour, not an app bug. Upgrade to
> `starter` for an always-on instance.

### 2. Frontend on Netlify

1. Netlify → **Add new site** → **Import an existing project** → pick the repo.
   `netlify.toml` sets base `frontend`, command `npm run build`, publish `dist`.
2. Add environment variables (Site settings → Environment variables):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `VITE_SITE_URL` | `https://<your-site>.netlify.app` |
   | `VITE_API_BASE_URL` | leave empty to use the proxy, or `https://<service>.onrender.com/api/v1` |

3. Deploy.

### 3. Wire the two together

- **Preview the Render host:** `netlify.toml` proxies `/api/*` to
  `https://cenagri-api.onrender.com` by default. If your Render service got a
  different name, edit that one line. With the proxy in place, leave
  `VITE_API_BASE_URL` unset — no CORS applies because the browser calls Netlify.
- **Calling Render directly instead?** Set `VITE_API_BASE_URL` to the full
  `https://…/api/v1` and set Render's `CORS_ORIGINS` to your Netlify origin
  exactly (scheme + host, **no trailing slash**).
- **Supabase:** Authentication → URL Configuration → set Site URL and Redirect
  URLs to the Netlify domain, or login/email links come back to localhost.

### 4. Database

Run the SQL files **in this order** on the production Supabase project:

```
schema.sql → features.sql → worker.sql → transporter.sql
→ warehouse.sql → equipment.sql
```

## Vercel (alternative)

Repo root contains `vercel.json`, so it works with zero settings:

1. Import the GitHub repo in Vercel.
2. Framework preset: **Vite** (auto-detected).
3. Add the env vars above → Deploy.

## Netlify

`netlify.toml` at the root sets base `frontend`, publish `dist` and the SPA
redirect. Just import the repo and add the env vars.

## Any static host (Cloudflare Pages, GitHub Pages, S3…)

- Build command: `npm ci && npm run build` (in `frontend/`)
- Output directory: `frontend/dist`
- Rewrite all paths to `/index.html` (SPA routing for `/login`, `/dashboard`…)

## Docker (frontend as nginx image)

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJhbGciOi… \
  --build-arg VITE_SITE_URL=https://cenagri.ai \
  -t cenagri-frontend ./frontend

docker run -p 8080:80 cenagri-frontend
```

Or the whole stack (Postgres + FastAPI + nginx frontend):

```bash
cp .env.example .env      # fill Supabase keys
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

## Checklist before going live

- [ ] `schema.sql` and every module file executed, in the order above
- [ ] `/health` on the Render URL returns `{"status":"ok"}`
- [ ] `CORS_ORIGINS` (Render) matches the Netlify origin exactly, if not proxying
- [ ] Email **Confirm email** enabled in Supabase
- [ ] Google provider redirect URI points at the production domain
- [ ] Production URLs added to Supabase Redirect URLs
- [ ] `.env` files never committed (`git status` check)
- [ ] `npm run build` passes locally
