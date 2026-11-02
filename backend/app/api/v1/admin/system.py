"""Analytics, audit logs and system health.

Analytics separates two kinds of number on purpose:

* **verified** — counts of rows that exist (accounts, videos, orders).
* **estimated** — anything derived from sampling or extrapolation. There is
  none in this module today; the field is present so a future estimate cannot
  be presented as a measurement by accident.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import Page, Pagination
from app.services import mandi as mandi_service
from app.services import advisory as advisory_service

router = APIRouter()


def _isodate(value: date | None, default_days_ago: int) -> str:
    day = value or (datetime.now(tz=timezone.utc) - timedelta(days=default_days_ago)).date()
    return day.isoformat()


# ── Analytics ─────────────────────────────────────────────────────────────


@router.get("/analytics")
async def analytics(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    admin: AdminActor = Depends(require_permission("analytics.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    start_iso = _isodate(start, 30)
    end_iso = _isodate(end, 0)

    async def _count(table: str, column: str = "id", filters: dict[str, str] | None = None) -> int | None:
        try:
            _, total = await store.select(table, columns=column, filters=filters, limit=1, count=True)
            return total
        except AdminStoreError:
            return None

    # Signups inside the window, bucketed by day and by role.
    # PostgREST takes one value per column, so the range is expressed with the
    # `and=` form rather than two `created_at` keys.
    growth: list[dict[str, Any]] | None
    by_role: dict[str, int] = {}
    try:
        rows = await store.select(
            "profiles",
            columns="created_at,role",
            filters={"and": f"(created_at.gte.{start_iso},created_at.lte.{end_iso}T23:59:59)"},
            order="created_at.asc",
            limit=1000,
        )
        by_day: dict[str, int] = {}
        for row in rows:
            by_role[str(row.get("role"))] = by_role.get(str(row.get("role")), 0) + 1
            day = str(row.get("created_at") or "")[:10]
            by_day[day] = by_day.get(day, 0) + 1
        growth = [{"day": k, "count": v} for k, v in sorted(by_day.items())]
    except AdminStoreError:
        growth = None

    videos_views = await _count("video_views")
    engagement = {
        "videos": await _count("videos", filters={"kind": "eq.video"}),
        "shorts": await _count("videos", filters={"kind": "eq.short"}),
        "comments": await _count("video_comments"),
        "views_total": videos_views,
        "likes": None,  # no like table today; `videos.like_count` is the aggregate
    }

    orders_retailer = await _count("retailer_orders")
    orders_market = await _count("orders")

    try:
        sales_rows = await store.select("retailer_orders", columns="amount_inr", limit=1000)
        sales_total = sum(float(r.get("amount_inr") or 0) for r in sales_rows)
    except AdminStoreError:
        sales_total = None

    return {
        "range": {"start": start_iso, "end": end_iso},
        "users": {
            "in_range": sum(by_role.values()) if by_role else None,
            "by_role": by_role or None,
            "growth": growth,
            "verified": True,
        },
        "content": {**engagement, "verified": True},
        "marketplace": {
            "orders": None
            if orders_retailer is None and orders_market is None
            else (orders_retailer or 0) + (orders_market or 0),
            "sales_inr": sales_total,
            "verified": True,
        },
        "note": "All figures are row counts from platform tables; there are no estimated values here.",
    }


@router.get("/analytics/export")
async def export_analytics(
    request: Request,
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    admin: AdminActor = Depends(require_permission("analytics.export")),
    store: AdminStore = Depends(get_admin_db),
) -> StreamingResponse:
    """CSV of the daily signup series — the only series with a stable shape."""
    start_iso = _isodate(start, 30)
    end_iso = _isodate(end, 0)
    try:
        rows = await store.select(
            "profiles",
            columns="created_at,role",
            filters={"created_at": f"gte.{start_iso}"},
            order="created_at.asc",
            limit=1000,
        )
    except AdminStoreError as exc:
        rows = []
    buckets: dict[str, dict[str, int]] = {}
    for row in rows:
        stamp = str(row.get("created_at") or "")[:10]
        if not stamp or stamp > end_iso:
            continue
        bucket = buckets.setdefault(stamp, {})
        role = str(row.get("role") or "Unknown")
        bucket[role] = bucket.get(role, 0) + 1

    await audit(
        store,
        request,
        admin,
        action="analytics.export",
        module="analytics",
        target_type="export",
        reason=f"range {start_iso}..{end_iso}",
    )

    def generate():
        yield "day,role,signups\n"
        for day in sorted(buckets):
            for role, count in sorted(buckets[day].items()):
                yield f"{day},{role},{count}\n"

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cenagri-analytics-{start_iso}_{end_iso}.csv"'},
    )


# ── Audit logs ────────────────────────────────────────────────────────────


@router.get("/audit", response_model=Page)
async def audit_logs(
    pagination: Annotated[Pagination, Depends()],
    module: str | None = Query(default=None, max_length=40),
    admin_id: str | None = Query(default=None, max_length=40),
    action: str | None = Query(default=None, max_length=80),
    target_id: str | None = Query(default=None, max_length=80),
    since: date | None = Query(default=None),
    admin: AdminActor = Depends(require_permission("security.audit")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    if module:
        filters["module"] = f"eq.{module}"
    if admin_id:
        filters["admin_id"] = f"eq.{admin_id}"
    if action:
        filters["action"] = f"eq.{action}"
    if target_id:
        filters["target_id"] = f"eq.{target_id}"
    if since:
        filters["created_at"] = f"gte.{since.isoformat()}"

    rows, total = await store.select(
        "admin_audit_logs",
        filters=filters,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


# ── System health ─────────────────────────────────────────────────────────


@router.get("/system/health")
async def system_health(
    admin: AdminActor = Depends(require_permission("system.health")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Service-by-service status. Configuration booleans only — never a key."""
    checks: dict[str, Any] = {}

    # Database: one cheap read.
    started = datetime.now(tz=timezone.utc)
    try:
        await store.select("profiles", columns="id", limit=1)
        checks["database"] = {
            "ok": True,
            "latency_ms": int((datetime.now(tz=timezone.utc) - started).total_seconds() * 1000),
        }
    except AdminStoreError as exc:
        checks["database"] = {"ok": False, "error": str(exc)}

    checks["admin_tables"] = {"ok": True}
    for table in ("admin_users", "admin_audit_logs", "platform_settings"):
        try:
            await store.select(table, columns="*", limit=1)
        except AdminStoreError:
            checks["admin_tables"] = {"ok": False, "error": f"{table} is not installed"}

    return {
        "checked_at": datetime.now(tz=timezone.utc).isoformat(),
        "checks": checks,
        "integrations": {
            "mandi": {"configured": mandi_service.is_configured()},
            "ai": {"configured": advisory_service.is_configured()},
            "storage": {"configured": settings.admin_enabled},
        },
        "settings": {
            "mfa_required": settings.ADMIN_MFA_REQUIRED,
            "session_max_minutes": settings.ADMIN_SESSION_MAX_MINUTES,
            "rate_limit_per_minute": settings.ADMIN_RATE_LIMIT_PER_MINUTE,
            "environment": settings.APP_ENV,
        },
        "backup": {"status": "unknown", "note": "Backups are managed by the database provider."},
    }


# ── Deletion requests ─────────────────────────────────────────────────────


@router.get("/deletions", response_model=Page)
async def deletion_requests(
    pagination: Annotated[Pagination, Depends()],
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    admin: AdminActor = Depends(require_permission("users.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters = {"status": f"eq.{status_filter}"} if status_filter else {}
    rows, total = await store.select(
        "admin_deletion_requests",
        filters=filters,
        order="created_at.asc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/deletions/{request_id}")
async def decide_deletion(
    request_id: str,
    request: Request,
    decision: str = Query(pattern=r"^(approve|reject)$"),
    reason: str = Query(min_length=3, max_length=300),
    admin: AdminActor = Depends(require_permission("users.delete")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Record a decision on an account deletion request.

    ``approve`` marks the request for the retention job; it does not erase rows
    here. Deleting data is a scheduled, reviewed operation — never a side effect
    of a button in the admin UI.
    """
    rows = await store.select("admin_deletion_requests", columns="id,status,user_id", filters={"id": f"eq.{request_id}"})
    if not rows:
        raise HTTPException(404, "Deletion request not found.")
    if rows[0].get("status") != "pending":
        raise HTTPException(409, "This request has already been decided.")

    status_value = "approved" if decision == "approve" else "rejected"
    now = datetime.now(tz=timezone.utc).isoformat()
    await store.update(
        "admin_deletion_requests",
        {"status": status_value, "decided_by": admin.user_id, "decided_at": now, "decision_note": reason},
        filters={"id": f"eq.{request_id}"},
    )
    await audit(
        store,
        request,
        admin,
        action=f"users.deletion.{status_value}",
        module="users",
        target_type="deletion_request",
        target_id=request_id,
        reason=reason,
        before={"status": "pending"},
        after={"status": status_value},
    )
    return {"ok": True, "status": status_value}


