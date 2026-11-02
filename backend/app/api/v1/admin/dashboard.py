"""Central admin dashboard summary.

Every number here is a COUNT (or a range query) against the real tables. When a
table has not been created yet — a deployment still running an older SQL file —
its counter reports ``None`` ("not available") instead of a zero, so the panel
can say "not set up" rather than pretending the platform is empty. Nothing in
this module invents or mixes in demonstration data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.security import AdminActor, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.services import advisory as advisory_service
from app.services import mandi as mandi_service

router = APIRouter()

ACCOUNT_TYPES = {
    "Farmer": "farmers",
    "Buyer": "buyers",
    "Retailer": "retailers",
    "Shop": "retailers",
    "Worker": "workers",
    "Transporter": "transporters",
    "Equipment": "equipment_owners",
    "Warehouse": "warehouse_owners",
    "Content Creator": "content_creators",
}


async def _count(
    store: AdminStore,
    table: str,
    *,
    filters: dict[str, str] | None = None,
) -> int | None:
    """Exact row count, or None when the table does not exist yet."""
    try:
        _, total = await store.select(table, columns="id", filters=filters, limit=1, count=True)
        return total
    except AdminStoreError:
        return None


async def _group_count(store: AdminStore, table: str, column: str) -> dict[str, int] | None:
    """Count rows per value of `column` — one query, no N+1."""
    try:
        rows = await store.select(table, columns=column, limit=1000)
    except AdminStoreError:
        return None
    counts: dict[str, int] = {}
    for row in rows:
        key = row.get(column)
        if key is None:
            continue
        counts[str(key)] = counts.get(str(key), 0) + 1
    return counts


async def _recent_registrations(store: AdminStore, days: int) -> list[dict[str, Any]] | None:
    """Daily signups for the growth chart, from real `profiles.created_at`."""
    since = (datetime.now(tz=timezone.utc) - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    try:
        rows = await store.select(
            "profiles",
            columns="created_at",
            filters={"created_at": f"gte.{since.isoformat()}"},
            order="created_at.asc",
            limit=1000,
        )
    except AdminStoreError:
        return None

    buckets: dict[str, int] = {}
    for offset in range(days):
        day = (since + timedelta(days=offset)).date().isoformat()
        buckets[day] = 0
    for row in rows:
        stamp = str(row.get("created_at") or "")[:10]
        if stamp in buckets:
            buckets[stamp] += 1
    return [{"day": day, "count": count} for day, count in buckets.items()]


@router.get("")
async def overview(
    days: int = Query(default=30, ge=7, le=180, description="Window for the growth chart"),
    admin: AdminActor = Depends(require_permission("dashboard.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Platform-wide counters for the overview dashboard.

    Shape notes:
      • ``null`` means "the table that holds this number is not set up yet".
      • DAU/MAU read ``profiles.last_active_at``, which only exists once the
        admin migration has run AND the app writes heartbeats to it — the UI
        labels them accordingly rather than guessing.
    """
    now = datetime.now(tz=timezone.utc)
    day_ago = (now - timedelta(days=1)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    total_users = await _count(store, "profiles")
    active_users = await _count(store, "profiles", filters={"account_status": "eq.active"})
    suspended = await _count(store, "profiles", filters={"account_status": "eq.suspended"})
    blocked = await _count(store, "profiles", filters={"account_status": "eq.blocked"})
    new_30d = await _count(store, "profiles", filters={"created_at": f"gte.{month_ago}"})
    dau = await _count(store, "profiles", filters={"last_active_at": f"gte.{day_ago}"})
    mau = await _count(store, "profiles", filters={"last_active_at": f"gte.{month_ago}"})

    by_role = await _group_count(store, "profiles", "role")
    accounts: dict[str, int | None] = {key: None for key in set(ACCOUNT_TYPES.values())}
    if by_role is not None:
        for key in accounts:
            accounts[key] = 0
        for role, count in by_role.items():
            bucket = ACCOUNT_TYPES.get(role)
            if bucket:
                accounts[bucket] = (accounts[bucket] or 0) + count

    [content_videos, shorts, posts, creator_posts] = await _all(
        _count(store, "videos", filters={"kind": "eq.video"}),
        _count(store, "videos", filters={"kind": "eq.short"}),
        _count(store, "posts"),
        _count(store, "creator_posts"),
    )
    published_videos = await _count(store, "videos", filters={"status": "eq.published"})
    total_posts = None if posts is None and creator_posts is None else (posts or 0) + (creator_posts or 0)

    [listings, products, orders, retailer_orders] = await _all(
        _count(store, "listings"),
        _count(store, "retailer_products"),
        _count(store, "orders"),
        _count(store, "retailer_orders"),
    )
    total_products = None if listings is None and products is None else (listings or 0) + (products or 0)
    total_orders = None if orders is None and retailer_orders is None else (orders or 0) + (retailer_orders or 0)

    pending_kyc = await _count(store, "admin_kyc_requests", filters={"status": "eq.pending"})
    videos_reported = await _count(store, "video_reports", filters={"status": "eq.open"})
    open_tickets = await _count(store, "support_tickets", filters={"status": "in.(open,in_progress,waiting_user)"})
    pending_deletions = await _count(store, "admin_deletion_requests", filters={"status": "eq.pending"})

    # Pending reports = everything a moderator still has to look at.
    if videos_reported is None and open_tickets is None:
        pending_reports = None
    else:
        pending_reports = (videos_reported or 0) + (open_tickets or 0)

    growth = await _recent_registrations(store, days)

    # Content engagement: views over the last 30 days, straight from events.
    try:
        _, views_30d = await store.select(
            "video_views",
            columns="video_id",
            filters={"created_at": f"gte.{month_ago}"},
            limit=1,
            count=True,
        )
    except AdminStoreError:
        views_30d = None

    recent_activity = await _recent_activity(store)

    return {
        "generated_at": now.isoformat(),
        "users": {
            "total": total_users,
            "active": active_users,
            "suspended": suspended,
            "blocked": blocked,
            "new_30d": new_30d,
            "dau": dau,
            "mau": mau,
        },
        "accounts": accounts,
        "content": {
            "posts": total_posts,
            "videos": content_videos,
            "shorts": shorts,
            "published_videos": published_videos,
            "views_30d": views_30d,
        },
        "marketplace": {
            "products": total_products,
            "orders": total_orders,
        },
        "queues": {
            "pending_kyc": pending_kyc,
            "pending_reports": pending_reports,
            "open_tickets": open_tickets,
            "pending_deletions": pending_deletions,
        },
        "growth": growth,
        "activity": recent_activity,
        "services": _services_snapshot(),
    }


async def _all(*coros):
    """Run several counts concurrently."""
    import asyncio

    return await asyncio.gather(*coros)


async def _recent_activity(store: AdminStore) -> list[dict[str, Any]]:
    """Admin actions + newest signups, merged into one short feed."""
    items: list[dict[str, Any]] = []

    # If the audit permission is missing this endpoint can still render the rest:
    # the feed simply starts with signups.
    try:
        logs = await store.select(
            "admin_audit_logs",
            columns="id,admin_email,admin_role,action,module,target_type,target_id,created_at",
            order="created_at.desc",
            limit=8,
        )
        items.extend(
            {
                "kind": "admin",
                "title": f"{row.get('admin_email') or 'Admin'} · {row.get('action')}",
                "detail": f"{row.get('module')} {row.get('target_type') or ''}".strip(),
                "at": row.get("created_at"),
            }
            for row in logs
        )
    except AdminStoreError:
        pass

    try:
        signups = await store.select(
            "profiles",
            columns="id,full_name,email,role,created_at",
            order="created_at.desc",
            limit=6,
        )
        items.extend(
            {
                "kind": "signup",
                "title": f"New {row.get('role') or 'account'} · {row.get('full_name') or row.get('email')}",
                "detail": row.get("email"),
                "at": row.get("created_at"),
            }
            for row in signups
        )
    except AdminStoreError:
        pass

    items.sort(key=lambda item: str(item.get("at") or ""), reverse=True)
    return items[:10]


def provider_status() -> dict[str, Any]:
    """Whether a model is configured — never the key, never the base URL."""
    return {
        "configured": advisory_service.is_configured(),
        "model": advisory_service.settings.LLM_MODEL if advisory_service.is_configured() else None,
    }


def _services_snapshot() -> dict[str, Any]:
    """Integration health — configuration only, never a key."""
    return {
        "mandi": {
            "configured": mandi_service.is_configured(),
            "source": "data.gov.in",
        },
        "ai": provider_status(),
    }
