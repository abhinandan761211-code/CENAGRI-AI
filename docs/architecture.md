# Architecture

```
┌────────────┐      HTTPS/JSON      ┌────────────┐      SQL       ┌──────────────┐
│  frontend  │ ───────────────────▶ │  backend   │ ─────────────▶ │  PostgreSQL  │
│ React + TS │ ◀─────────────────── │  FastAPI   │ ◀───────────── │  (database/) │
└────────────┘                      └────────────┘                └──────────────┘
                                          │
                                          ▼
                                   AI / LLM providers
```

## Layers

| Layer | Responsibility |
|-------|----------------|
| `frontend/` | UI, state, API client (`src/lib/api.ts`) |
| `backend/app/api` | HTTP routing, request validation |
| `backend/app/services` | Business logic, AI orchestration |
| `backend/app/models` | SQLAlchemy ORM models |
| `backend/app/schemas` | Pydantic request/response models |
| `database/` | SQL schema, migrations, seeds |
| `infrastructure/` | Docker, nginx, deployment |

## Conventions

- All API routes are versioned under `/api/v1`.
- Secrets live only in `.env` (never committed).
- Schema changes are additive SQL files in `database/migrations`.
