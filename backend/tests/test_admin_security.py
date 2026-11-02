"""Security tests for the admin panel.

These run with no network and no Supabase project: the token layer is exercised
directly, and the RBAC layer is exercised through FastAPI with the admin store
replaced by an in-memory fake. That makes the important guarantees — "a normal
user is refused", "a moderator cannot suspend accounts", "the frontend's word
means nothing" — reproducible in CI without a database.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from jose import jwt

from app.core import security
from app.core.config import settings
from app.core.security import AdminActor, require_permission


# ── helpers ───────────────────────────────────────────────────────────────


def make_token(sub: str, *, secret: str | None = None, aud: str = "authenticated", iat_offset: int = 0) -> str:
    secret = secret or settings.SUPABASE_JWT_SECRET
    now = datetime.now(tz=timezone.utc) + timedelta(seconds=iat_offset)
    return jwt.encode(
        {
            "sub": sub,
            "aud": aud,
            "email": f"{sub}@cenagri.test",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=2)).timestamp()),
            "aal": "aal1",
        },
        secret,
        algorithm="HS256",
    )


class FakeStore:
    """The few reads `require_admin` needs, without PostgREST."""

    def __init__(self, admin_row=None, role="moderator", permissions=("content.view",)):
        self.admin_row = admin_row
        self.role = role
        self.permissions = permissions

    async def select(self, table, **kwargs):
        if table == "admin_users":
            return [self.admin_row] if self.admin_row else []
        if table == "admin_roles":
            return [{"key": self.role, "label": self.role.replace("_", " ").title()}]
        return []

    async def all_pages(self, table, **kwargs):
        if table == "admin_role_permissions":
            return [{"permission_key": p} for p in self.permissions]
        return []


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    """Give the tests a signing secret and a service role to work with."""
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "test-secret-" + "x" * 32)
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
    security.clear_admin_cache()
    yield
    security.clear_admin_cache()


# ── token verification ────────────────────────────────────────────────────


def test_token_signed_with_wrong_secret_is_rejected():
    token = make_token("user-1", secret="not-the-project-secret-" + "y" * 32)
    with pytest.raises(HTTPException) as err:
        security._decode_token(token, [])
    assert err.value.status_code == 401


def test_token_for_another_audience_is_rejected():
    token = make_token("user-1", aud="some-other-api")
    with pytest.raises(HTTPException) as err:
        security._decode_token(token, [])
    assert err.value.status_code == 401


def test_expired_token_is_rejected():
    now = datetime.now(tz=timezone.utc)
    token = jwt.encode(
        {
            "sub": "user-1",
            "aud": "authenticated",
            "iat": int((now - timedelta(days=2)).timestamp()),
            "exp": int((now - timedelta(days=1)).timestamp()),
        },
        settings.SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as err:
        security._decode_token(token, [])
    assert err.value.status_code == 401


def test_session_older_than_the_admin_window_is_rejected():
    claims = {"iat": int((datetime.now(tz=timezone.utc) - timedelta(hours=999)).timestamp())}
    with pytest.raises(HTTPException) as err:
        security._check_session_age(claims)
    assert err.value.status_code == 401


# ── admin resolution + RBAC ───────────────────────────────────────────────


def _app_with(store: FakeStore, permission: str) -> TestClient:
    app = FastAPI()

    @app.get("/probe")
    async def probe(admin: AdminActor = Depends(require_permission(permission))):
        return {"admin": admin.user_id, "role": admin.role_key, "perms": sorted(admin.permissions)}

    from app.db.session import get_admin_db

    app.dependency_overrides[get_admin_db] = lambda: store
    return TestClient(app)


def test_normal_user_without_admin_row_is_forbidden():
    store = FakeStore(admin_row=None)
    client = _app_with(store, "dashboard.view")
    res = client.get("/probe", headers={"Authorization": f"Bearer {make_token('normal-user')}"})
    assert res.status_code == 403
    assert "admin access" in res.json()["detail"]


def test_disabled_admin_is_forbidden():
    store = FakeStore(
        admin_row={"user_id": "a-1", "role_key": "moderator", "is_active": False, "extra_permissions": []},
        permissions=("dashboard.view",),
    )
    client = _app_with(store, "dashboard.view")
    res = client.get("/probe", headers={"Authorization": f"Bearer {make_token('a-1')}"})
    assert res.status_code == 403
    assert "disabled" in res.json()["detail"]


def test_admin_gets_only_their_permissions():
    store = FakeStore(
        admin_row={"user_id": "a-2", "role_key": "moderator", "is_active": True, "extra_permissions": []},
        role="moderator",
        permissions=("dashboard.view", "content.view"),
    )
    client = _app_with(store, "dashboard.view")
    res = client.get("/probe", headers={"Authorization": f"Bearer {make_token('a-2')}"})
    assert res.status_code == 200
    assert res.json()["perms"] == ["content.view", "dashboard.view"]

    # ... and the permission they do NOT hold is refused on the same session.
    from app.db.session import get_admin_db

    app = FastAPI()

    @app.post("/suspend")
    async def suspend(admin: AdminActor = Depends(require_permission("users.moderate"))):
        return {"ok": True}

    app.dependency_overrides[get_admin_db] = lambda: store
    client2 = TestClient(app)
    res2 = client2.post("/suspend", headers={"Authorization": f"Bearer {make_token('a-2')}"})
    assert res2.status_code == 403


def test_no_token_is_401_not_403():
    client = _app_with(FakeStore(None), "dashboard.view")
    assert client.get("/probe").status_code == 401


def test_malformed_authorization_header_is_401():
    client = _app_with(FakeStore(None), "dashboard.view")
    assert client.get("/probe", headers={"Authorization": "Token abc"}).status_code == 401


# ── audit log sanitisation ────────────────────────────────────────────────


def test_audit_snapshot_strips_secrets():
    from app.db.admin_store import _safe_json

    safe = _safe_json(
        {
            "email": "farmer@cenagri.test",
            "password": "hunter2",
            "api_key": "sk-live-123",
            "document_url": "kyc/aadhaar.pdf",
            "nested": {"secret": "x", "status": "active"},
        }
    )
    assert safe == {"email": "farmer@cenagri.test", "nested": {"status": "active"}}


def test_permission_cache_is_cleared_on_change():
    store = FakeStore(
        admin_row={"user_id": "a-3", "role_key": "moderator", "is_active": True, "extra_permissions": []},
        permissions=("content.view",),
    )
    actor = asyncio.run(security._load_admin(store, "a-3", "a-3@x", {}))
    assert actor.can("content.view")
    security.clear_admin_cache()
    store.permissions = ()
    store.admin_row["role_key"] = "support_manager"
    actor2 = asyncio.run(security._load_admin(store, "a-3", "a-3@x", {}))
    assert actor2.role_key == "support_manager"
    assert not actor2.can("content.view")
