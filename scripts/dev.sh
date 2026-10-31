#!/usr/bin/env bash
# Start backend + frontend locally in development mode.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ Starting FastAPI on :8000"
(cd "$ROOT/backend" && uvicorn app.main:app --reload --port 8000) &
BACKEND_PID=$!

echo "▶ Starting Vite on :5173"
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT INT TERM
wait
