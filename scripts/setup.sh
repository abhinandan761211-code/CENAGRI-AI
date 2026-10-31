#!/usr/bin/env bash
# One-time local setup: create venv, install deps, run frontend install.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "✔ Created .env from .env.example (update secrets)"
fi

echo "▶ Python venv + deps"
python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/pip" install --upgrade pip
"$ROOT/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"

echo "▶ Frontend deps"
(cd "$ROOT/frontend" && npm install)

echo "✔ Setup complete. Run: ./scripts/dev.sh"
