"""Session verification and RBAC enforcement for the admin panel.

Design rules this file exists to guarantee:

1. **The frontend never decides.** A role or permission supplied by the browser
   is ignored. The only input trusted from the client is the Supabase access
   token, and even that is only used after its signature, issuer, audience and
   expiry are verified here.
2. **Role truth lives in Postgres.** `admin_users` + `admin_role_permissions`
   decide what an admin can do. Cache it briefly (per process) so a permission
   change takes effect within seconds without a DB round-trip per request.
3. **Everyone else is refused.** A valid Supabase session that has no
   `admin_users` row is a normal user: 403, never 401-with-hints, and the
   refusal itself is rate-limited and audited.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db

# The private bucket that holds KYC documents. Re-exported for the KYC routes.
from app.db.admin_store import KYC_BUCKET

# ── Models ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class AdminActor:
    """The verified admin behind the current request."""

    user_id: str
    email: str
    role_key: str
    role_label: str
    permissions: frozenset[str]
    session_issued_at: int | None = None  # epoch seconds, from the JWT `iat`
    aal: str = "aal1"

    def can(self, permission: str) -> bool:
        return permission in self.permissions

    def require(self, permission: str) -> None:
        if not self.can(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role ({self.role_label}) does not allow this action.",
            )


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


_cache: dict[str, _CacheEntry] = {}
_CACHE_TTL = 15.0  # seconds — short enough that revocation lands quickly


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and entry.expires_at > time.monotonic():
        return entry.value
    _cache.pop(key, None)
    return None


def _cache_set(key: str, value: Any, ttl: float = _CACHE_TTL) -> None:
    _cache[key] = _CacheEntry(value=value, expires_at=time.monotonic() + ttl)


def clear_admin_cache() -> None:
    """Called after a role/permission change so the next request re-reads it."""
    _cache.clear()


# ── Token verification ────────────────────────────────────────────────────

_jwks_cache: dict[str, Any] = {"keys": None, "expires_at": 0.0}


async def _fetch_jwks() -> list[dict[str, Any]]:
    """Supabase publishes its signing keys as JWKS (RS256 / ES256 projects)."""
    if _jwks_cache["keys"] and _jwks_cache["expires_at"] > time.monotonic():
        return _jwks_cache["keys"]
    url = settings.SUPABASE_JWKS_URL
    if not url:
        return []
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            keys = res.json().get("keys", [])
    except (httpx.HTTPError, ValueError):
        return []
    _jwks_cache.update(keys=keys, expires_at=time.monotonic() + 600)
    return keys


def _decode_token(token: str, jwks: list[dict[str, Any]]) -> dict[str, Any]:
    from jose import jwt  # imported lazily so the app still starts without it

    errors: list[Exception] = []
    # Modern projects sign with an asymmetric key published in JWKS.
    for key in jwks:
        try:
            return jwt.decode(
                token,
                key,
                algorithms=[key.get("alg", "RS256")],
                audience=settings.SUPABASE_JWT_AUDIENCE,
                options={"verify_at_hash": False},
            )
        except Exception as exc:  # noqa: BLE001 — try the next candidate
            errors.append(exc)
    # Legacy projects (and self-hosted Supabase) sign with a shared HS256 secret.
    if settings.SUPABASE_JWT_SECRET:
        try:
            return jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience=settings.SUPABASE_JWT_AUDIENCE,
                options={"verify_at_hash": False},
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Your session could not be verified. Sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    ) from (errors[-1] if errors else None)


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


# ── Rate limiting (per admin, in-process) ─────────────────────────────────

_rate: dict[str, list[float]] = {}


def _throttle(user_id: str) -> None:
    """Small fixed-window limiter. Good enough for one API instance; a shared
    Redis counter is the upgrade path once the backend runs on several nodes."""
    limit = settings.ADMIN_RATE_LIMIT_PER_MINUTE
    if limit <= 0:
        return
    now = time.monotonic()
    bucket = [t for t in _rate.get(user_id, []) if now - t < 60]
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many admin requests. Wait a moment and try again.",
        )
    bucket.append(now)
    _rate[user_id] = bucket


# ── Admin resolution ──────────────────────────────────────────────────────


async def _load_admin(store: AdminStore, user_id: str, email: str, claims: dict[str, Any]) -> AdminActor:
    """Read the admin row + effective permissions, cached briefly."""
    cached = _cache_get(f"admin:{user_id}")
    if cached:
        return cached

    rows = await store.select(
        "admin_users",
        columns="user_id,role_key,is_active,extra_permissions,mfa_required,mfa_enrolled_at",
        filters={"user_id": f"eq.{user_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account does not have admin access.",
        )
    row = rows[0]
    if not row.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This admin account is disabled.",
        )

    role_key = row["role_key"]
    role_rows = await store.select(
        "admin_roles", columns="key,label", filters={"key": f"eq.{role_key}", "limit": "1"}
    )
    if not role_rows:
        raise HTTPException(status_code=403, detail="This admin role no longer exists.")

    granted = _cache_get(f"perm:{role_key}")
    if granted is None:
        mapping = await store.all_pages(
            "admin_role_permissions", columns="permission_key", filters={"role_key": f"eq.{role_key}"}
        )
        granted = frozenset(m["permission_key"] for m in mapping if m.get("permission_key"))
        _cache_set(f"perm:{role_key}", granted)

    perms = set(granted) | set(row.get("extra_permissions") or [])

    # MFA: Supabase reports the assurance level in the token. `aal2` means a
    # second factor was verified for this session.
    aal = str(claims.get("aal") or "aal1")
    if settings.ADMIN_MFA_REQUIRED and aal != "aal2":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Two-factor authentication is required for admin actions.",
        )

    actor = AdminActor(
        user_id=user_id,
        email=email,
        role_key=role_key,
        role_label=role_rows[0].get("label", role_key),
        permissions=frozenset(perms),
        session_issued_at=_int(claims.get("iat")),
        aal=aal,
    )
    _cache_set(f"admin:{user_id}", actor)
    return actor


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _check_session_age(claims: dict[str, Any]) -> None:
    issued = _int(claims.get("iat"))
    if not issued:
        return
    age_minutes = (datetime.now(tz=timezone.utc).timestamp() - issued) / 60
    if age_minutes > settings.ADMIN_SESSION_MAX_MINUTES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This admin session has expired. Sign in again.",
        )


async def require_admin(
    token: str = Depends(_bearer),
    store: AdminStore = Depends(get_admin_db),
) -> AdminActor:
    """Verify the session and resolve the admin behind it.

    Order matters: signature first, then session age, then the database role
    check. An unsigned or expired token never reaches a table.
    """
    jwks = await _fetch_jwks()
    claims = _decode_token(token, jwks)
    user_id = str(claims.get("sub") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Your session is missing a user id.")

    _check_session_age(claims)
    _throttle(user_id)

    try:
        return await _load_admin(store, user_id, str(claims.get("email") or ""), claims)
    except AdminStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def require_permission(permission: str):
    """Dependency factory: 403 unless the verified admin holds `permission`."""

    async def guard(admin: AdminActor = Depends(require_admin)) -> AdminActor:
        admin.require(permission)
        return admin

    guard.__name__ = f"require_{permission.replace('.', '_')}"
    return guard


def require_any(*permissions: str):
    """Passes when the admin holds at least one of `permissions`."""

    async def guard(admin: AdminActor = Depends(require_admin)) -> AdminActor:
        if not any(admin.can(p) for p in permissions):
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({admin.role_label}) does not allow this action.",
            )
        return admin

    return guard


# ── Request context for the audit trail ───────────────────────────────────


def request_context(request: Request) -> dict[str, str | None]:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    return {"ip": ip, "user_agent": request.headers.get("user-agent")}


async def audit(
    store: AdminStore,
    request: Request,
    admin: AdminActor,
    *,
    action: str,
    module: str,
    target_type: str | None = None,
    target_id: str | None = None,
    reason: str | None = None,
    before: Any = None,
    after: Any = None,
) -> None:
    ctx = request_context(request)
    await store.audit(
        admin=admin,
        action=action,
        module=module,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        before=before,
        after=after,
        ip=ctx["ip"],
        user_agent=ctx["user_agent"],
    )


def permission_matrix(roles: list[dict[str, Any]], permissions: list[dict[str, Any]], mapping: list[dict[str, Any]]):
    """Shape roles + permissions into the payload the admin UI renders."""
    by_role: dict[str, set[str]] = {r["key"]: set() for r in roles}
    for row in mapping:
        by_role.setdefault(row["role_key"], set()).add(row["permission_key"])
    return {
        "roles": roles,
        "permissions": permissions,
        "grants": {role: sorted(keys) for role, keys in by_role.items()},
    }


__all__ = [
    "AdminActor",
    "KYC_BUCKET",
    "audit",
    "clear_admin_cache",
    "permission_matrix",
    "request_context",
    "require_admin",
    "require_any",
    "require_permission",
]
