# CenAGRI-AI

AI-powered agriculture platform — professional full-stack monorepo.

## Structure

```
CENAGRI AI 1.O/
├── frontend/            React + TypeScript + Tailwind (Vite)
│   ├── src/
│   │   ├── components/  Reusable UI components
│   │   ├── pages/       Route-level pages
│   │   ├── hooks/       Custom React hooks
│   │   ├── lib/         API client & utilities
│   │   ├── types/       Shared TypeScript types
│   │   └── assets/      Images, fonts, static files
│   └── public/
├── backend/             FastAPI + Python
│   ├── app/
│   │   ├── api/v1/      Versioned HTTP routes
│   │   ├── core/        Settings, security
│   │   ├── models/      SQLAlchemy ORM models
│   │   ├── schemas/     Pydantic schemas
│   │   ├── services/    Business & AI logic
│   │   └── db/          Engine, session, Base
│   └── requirements.txt
├── database/            SQL migrations, schema, seeds
│   └── supabase/        Supabase schema + RLS (profiles, farms)
├── infrastructure/      Docker Compose, nginx
├── docs/                Architecture, API, Supabase & deployment guides
├── scripts/             Dev & maintenance scripts
├── tests/               Integration & E2E tests
├── netlify.toml         Netlify deploy config
├── vercel.json          Vercel deploy config
├── .env.example         Environment template
└── .gitignore
```

## Quick start (local)

```bash
cp .env.example .env                    # then edit secrets
cp frontend/.env.example frontend/.env  # add Supabase URL + anon key
./scripts/setup.sh                      # venv + deps + npm install
./scripts/dev.sh                        # backend :8000 + frontend :5173
```

- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

## Quick start (Docker)

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

## Authentication (Supabase)

Auth is handled by Supabase — the FastAPI backend is **not** in the auth path.

| Flow | Route |
|------|-------|
| Email + password sign up | `/signup` |
| Email + password sign in | `/login` |
| Google OAuth | Google button on `/login` and `/signup` |
| Email verification + OAuth callback | `/auth/callback` |
| Forgot / reset password | `/forgot-password` → `/reset-password` |
| Signed-in area | `/dashboard` (protected) |

Setup steps (create project, run `database/supabase/schema.sql`, enable Google):
see **[docs/supabase-setup.md](docs/supabase-setup.md)**.

Deploying to Vercel / Netlify / Docker: see **[docs/deployment.md](docs/deployment.md)**.

## Tech stack

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 18, TypeScript, Tailwind CSS, Vite |
| Backend   | FastAPI, Python 3.12, SQLAlchemy 2, Pydantic v2 |
| Database  | Supabase (PostgreSQL 15) |
| Auth      | Supabase Auth — email/password + Google OAuth |
| Infra     | Docker Compose, nginx |

## Conventions

- API routes versioned under `/api/v1`.
- Secrets only in `.env` — never committed.
- New schema changes go to `database/migrations`.
- Docs updated alongside code (`docs/architecture.md`, `docs/api.md`).
