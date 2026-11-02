"""Route-level tests: the admin API refuses anyone who is not a verified admin.

These exercise the real routers (mounted with a stub store) rather than a toy
app, so a route that forgot its `require_permission` dependency shows up here.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.admin import business, dashboard, roles, users
from app.core import security
from app.core.config import settings
from app.db.session import get_admin_db
from tests.test_admin_security import FakeStore, make_token


def _client(store: FakeStore) -> TestClient:
    app = FastAPI()
    app.include_router(dashboard.router, prefix="/dashboard")
    app.include_router(users.router, prefix="/users")
    app.include_router(roles.router, prefix="/roles")
    app.include_router(business.router, prefix="/business")
    app.dependency_overrides[get_admin_db] = lambda: store
    return TestClient(app)


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "route-test-secret-" + "z" * 32)
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
    security.clear_admin_cache()
    yield
    security.clear_admin_cache()


def _admin(role="super_admin", permissions=None):
    return FakeStore(
        admin_row={
            "user_id": "a-1",
            "role_key": role,
            "is_active": True,
            "extra_permissions": [],
            "mfa_required": False,
        },
        role=role,
        permissions=tuple(permissions or ["dashboard.view", "users.view", "users.moderate"]),
    )


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/dashboard"),
        ("get", "/users"),
        ("get", "/users/export"),
        ("get", "/roles"),
        ("get", "/business/orders"),
        ("get", "/business/listings"),
    ],
)
def test_every_admin_route_requires_auth(method, path):
    client = _client(_admin())
    res = getattr(client, method)(path)
    assert res.status_code == 401, f"{path} answered {res.status_code} without a token"


def test_view_only_role_cannot_suspend():
    store = _admin(role="support_manager", permissions=["dashboard.view", "users.view"])
    client = _client(store)
    res = client.post(
        "/users/user-9/status",
        headers={"Authorization": f"Bearer {make_token('a-1')}"},
        json={"status": "suspended", "reason": "Spam", "confirm_email": "x@y.z"},
    )
    assert res.status_code == 403
    assert "does not allow" in res.json()["detail"]


def test_suspension_requires_the_matching_email():
    store = _admin()
    # The store returns a profile whose email does not match the confirmation.
    store.select = _profile_select  # type: ignore[assignment]
    client = _client(store)
    res = client.post(
        "/users/user-9/status",
        headers={"Authorization": f"Bearer {make_token('a-1')}"},
        json={"status": "suspended", "reason": "Spam", "confirm_email": "wrong@example.com"},
    )
    assert res.status_code == 422
    assert "confirmation email" in res.json()["detail"]


def test_short_reason_is_rejected_by_validation():
    store = _admin()
    client = _client(store)
    res = client.post(
        "/users/user-9/status",
        headers={"Authorization": f"Bearer {make_token('a-1')}"},
        json={"status": "suspended", "reason": "x", "confirm_email": "x@y.z"},
    )
    assert res.status_code == 422


def test_invalid_account_status_is_rejected():
    store = _admin()
    client = _client(store)
    res = client.post(
        "/users/user-9/status",
        headers={"Authorization": f"Bearer {make_token('a-1')}"},
        json={"status": "deleted", "reason": "Cleanup", "confirm_email": "x@y.z"},
    )
    assert res.status_code == 422


def test_non_super_admin_cannot_edit_permissions():
    store = _admin(role="admin", permissions=["roles.view", "roles.manage"])
    client = _client(store)
    res = client.patch(
        "/roles/moderator/permissions",
        headers={"Authorization": f"Bearer {make_token('a-1')}"},
        json={"permission_keys": ["content.view"], "reason": "trim role"},
    )
    assert res.status_code == 403
    assert "Super Admin" in res.json()["detail"]


def test_unknown_refund_source_is_rejected():
    store = _admin(permissions=["orders.view", "finance.refund"])
    client = _client(store)
    res = client.post(
        "/business/orders/ord-1/refund",
        headers={"Authorization": f"Bearer {make_token('a-1')}"},
        params={"source": "nowhere", "amount": 10, "reason": "Customer complained twice"},
    )
    assert res.status_code == 422


async def _profile_select(table, **kwargs):
    """A store that knows one profile row, one admin row and one role.

    `require_admin` reads `admin_users` and `admin_roles` too, so both must
    still answer — overriding only `select` on the FakeStore removes its own
    role lookup and the request fails at authorisation instead of validation.
    """
    if table == "profiles":
        return [
            {
                "id": "user-9",
                "email": "real@cenagri.test",
                "account_status": "active",
                "status_reason": None,
            }
        ]
    if table == "admin_users":
        return [
            {
                "user_id": "a-1",
                "role_key": "super_admin",
                "is_active": True,
                "extra_permissions": [],
                "mfa_required": False,
            }
        ]
    if table == "admin_roles":
        return [{"key": "super_admin", "label": "Super Admin"}]
    return []
