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

## Vercel

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

- [ ] `database/supabase/schema.sql` executed on the production project
- [ ] Email **Confirm email** enabled
- [ ] Google provider configured with the production redirect URI
- [ ] Production URL added to Supabase Redirect URLs
- [ ] `.env` files never committed (`git status` check)
- [ ] `npm run build` passes locally
