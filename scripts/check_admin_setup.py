#!/usr/bin/env python
"""CenAGRI-AI — admin panel readiness check.

Run from the repo root *after* running database/supabase/admin.sql,
admin_seed.sql and admin_storage.sql:

    backend/.venv/bin/python scripts/check_admin_setup.py

It only READS. It prints exactly which of the four steps is still missing:
env config → tables present → super admin row → API route mounted.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# settings reads `.env` from the CWD first, then the repo root. Run this script
# from anywhere and it must still see backend/.env, so load it explicitly first.
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env", override=False)

from app.core.config import settings  # noqa: E402

OK, WARN, BAD = "✔", "!", "✘"
problems: list[str] = []


def line(mark: str, text: str) -> None:
    print(f"  {mark} {text}")


def supabase_get(path: str, key: str) -> tuple[int, list | dict | None]:
    url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/{path}"
    req = urllib.request.Request(
        url,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as exc:
        return exc.code, None
    except Exception as exc:  # network/dns
        return 0, str(exc)  # type: ignore[return-value]


print("\n1) Environment (backend/.env)")
if settings.SUPABASE_URL:
    line(OK, f"SUPABASE_URL = {settings.SUPABASE_URL}")
else:
    line(BAD, "SUPABASE_URL is empty")
    problems.append("Set SUPABASE_URL in backend/.env")

key = settings.SUPABASE_SERVICE_ROLE_KEY
if key:
    line(OK, f"SUPABASE_SERVICE_ROLE_KEY = set ({len(key)} chars)")
else:
    line(BAD, "SUPABASE_SERVICE_ROLE_KEY is empty")
    problems.append("Set SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API → service_role)")

if settings.SUPABASE_JWT_SECRET:
    line(OK, "SUPABASE_JWT_SECRET = set (legacy HS256 project)")
elif settings.SUPABASE_URL:
    line(OK, f"JWKS verification → {settings.SUPABASE_JWKS_URL}")
else:
    line(BAD, "No signing secret and no SUPABASE_URL to derive JWKS from")

if settings.admin_enabled:
    line(OK, "admin_enabled = True → /api/v1/admin will be mounted")
else:
    line(BAD, "admin_enabled = False → the admin router is NOT mounted (404)")
    problems.append("The three SUPABASE_* values above must all be present")

if not (key and settings.SUPABASE_URL):
    print("\nStopping: fill backend/.env first, then re-run.\n")
    sys.exit(1)

print("\n2) Database (database/supabase/admin.sql)")

TABLES = {
    "admin_roles": "admin.sql not run",
    "admin_permissions": "admin.sql not run",
    "admin_role_permissions": "admin.sql not run",
    "admin_users": "admin.sql not run",
    "admin_kyc_requests": "admin.sql not run",
    "storage buckets (kyc-documents)": "admin_storage.sql not run",
}

for table, hint in TABLES.items():
    if table.startswith("storage"):
        status, _ = "python-only", None
        line(WARN, f"{table}: check in Dashboard → Storage (private bucket expected)")
        continue
    code, body = supabase_get(f"{table}?select=*&limit=1", key)
    if code == 200:
        line(OK, f"public.{table} reachable via service role")
    elif code in (401, 403):
        line(BAD, f"public.{table}: service role rejected ({code}) — wrong key?")
        problems.append(f"Service role key cannot read {table}")
    elif code == 404:
        line(BAD, f"public.{table}: missing — {hint}")
        problems.append(hint)
    elif code == 0:
        line(BAD, f"public.{table}: network error — {body}")
        problems.append("Cannot reach Supabase REST API")
        break
    else:
        line(BAD, f"public.{table}: HTTP {code}")

print("\n3) Super admin")
code, rows = supabase_get(
    "admin_users?select=user_id,role_key,is_active&is_active=eq.true", key
)
if code == 200 and isinstance(rows, list):
    active = [r for r in rows if r.get("role_key") == "super_admin"]
    if active:
        line(OK, f"{len(active)} active super_admin row(s)")
        for r in active[:5]:
            print(f"      {r['user_id']}")
    else:
        line(BAD, "No active super_admin row")
        problems.append(
            "insert into public.admin_users (user_id, role_key) "
            "values ('<auth.users.id>', 'super_admin') on conflict (user_id) do update "
            "set role_key = excluded.role_key, is_active = true;"
        )
elif code == 404:
    pass  # already reported in step 2
else:
    line(BAD, f"could not read admin_users (HTTP {code})")

print("\n4) API route")
try:
    from app.main import app  # noqa: PLC0415

    # FastAPI >= 0.162 keeps included routers lazy (`_IncludedRouter`), so
    # `app.routes` no longer lists the child paths. The OpenAPI schema is the
    # public answer to "is this route reachable", so ask it instead.
    paths = list(app.openapi().get("paths", {}))
    admin_paths = [p for p in paths if p.startswith("/api/v1/admin")]
    if admin_paths:
        line(OK, f"admin API mounted: {len(admin_paths)} path(s), e.g. {sorted(admin_paths)[0]}")
    else:
        line(BAD, "admin API not mounted (all /api/v1/admin/* would 404)")
        problems.append("Check backend/app/api/v1/__init__.py and settings.admin_enabled")
except Exception as exc:  # pragma: no cover - import-time failure
    line(BAD, f"could not import the API: {exc}")
    problems.append("Fix the backend import error above")

print()
if problems:
    print("Still to do:")
    for p in dict.fromkeys(problems):
        print(f"  • {p}")
    print()
    sys.exit(1)

print("Everything checks out → start the backend and open /admin after a normal sign-in.\n")
