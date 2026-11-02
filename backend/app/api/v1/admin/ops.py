"""AI services, support tickets, notifications/CMS and platform settings.

Everything in this file follows the same rule: read configuration, never echo a
secret. A `secret`-kind platform setting is write-only through the API — the
response returns a masked placeholder, so an admin can tell a value is set
without ever being able to copy it out of the browser.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.config import settings
from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import (
    CampaignCreate,
    FlagUpdate,
    Page,
    Pagination,
    SettingsUpdate,
    TicketMessage,
    TicketUpdate,
)
from app.services import advisory as advisory_service

router = APIRouter()

SECRET_MASK = "••••••••"


# ── AI services ───────────────────────────────────────────────────────────


@router.get("/ai/status")
async def ai_status(
    admin: AdminActor = Depends(require_permission("ai.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Provider configuration and a live latency probe.

    The probe sends a tiny request only when an API key is configured. No key,
    no URL and no header ever leaves this function.
    """
    configured = advisory_service.is_configured()
    result: dict[str, Any] = {
        "configured": configured,
        "provider": "openai-compatible",
        "model": settings.LLM_MODEL if configured else None,
        "latency_ms": None,
        "healthy": None,
        "checked_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    if configured:
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    f"{settings.LLM_BASE_URL.rstrip('/')}/models",
                    headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"},
                )
            result["latency_ms"] = round((time.perf_counter() - started) * 1000)
            result["healthy"] = res.status_code < 500
            result["http_status"] = res.status_code
        except httpx.HTTPError:
            result["latency_ms"] = round((time.perf_counter() - started) * 1000)
            result["healthy"] = False
            result["http_status"] = None

    # Usage counters, if a deployment records them.
    try:
        rows, total = await store.select(
            "ai_request_logs", columns="created_at", order="created_at.desc", limit=1, count=True
        )
        result["requests_recorded"] = total
        result["last_request_at"] = rows[0].get("created_at") if rows else None
    except AdminStoreError:
        result["requests_recorded"] = None
        result["last_request_at"] = None
    return result


# ── Support & complaints ──────────────────────────────────────────────────


@router.get("/support/tickets", response_model=Page)
async def tickets(
    pagination: Annotated[Pagination, Depends()],
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    priority: str | None = Query(default=None, max_length=20),
    category: str | None = Query(default=None, max_length=20),
    assigned_to: str | None = Query(default=None, max_length=40),
    q: str | None = Query(default=None, max_length=80),
    admin: AdminActor = Depends(require_permission("support.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    for key, value in (("status", status_filter), ("priority", priority), ("category", category)):
        if value:
            filters[key] = f"eq.{value}"
    if assigned_to == "me":
        filters["assigned_to"] = f"eq.{admin.user_id}"
    elif assigned_to:
        filters["assigned_to"] = f"eq.{assigned_to}"
    or_filter = None
    if q and q.strip():
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"subject.ilike.*{safe}*,contact_email.ilike.*{safe}*"

    rows, total = await store.select(
        "support_tickets",
        columns="id,user_id,contact_email,subject,category,priority,status,assigned_to,created_at,updated_at",
        filters=filters,
        or_filter=or_filter,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/support/tickets/{ticket_id}")
async def ticket_detail(
    ticket_id: str,
    admin: AdminActor = Depends(require_permission("support.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select(
        "support_tickets", filters={"id": f"eq.{ticket_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    ticket = rows[0]
    messages = await store.select(
        "support_messages",
        columns="id,author_id,author_kind,body,is_internal,created_at",
        filters={"ticket_id": f"eq.{ticket_id}"},
        order="created_at.asc",
        limit=500,
    )
    if ticket.get("user_id"):
        people = await store.select(
            "profiles",
            columns="id,full_name,email,phone,role",
            filters={"id": f"eq.{ticket['user_id']}", "limit": "1"},
        )
        ticket["user"] = people[0] if people else None
    return {"ticket": ticket, "messages": messages}


@router.patch("/support/tickets/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    payload: TicketUpdate,
    request: Request,
    admin: AdminActor = Depends(require_permission("support.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    values = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not values:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    before = await store.select("support_tickets", columns="status,priority,assigned_to", filters={"id": f"eq.{ticket_id}"})
    if not before:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    values["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
    updated = await store.update("support_tickets", values, filters={"id": f"eq.{ticket_id}"})
    await audit(
        store,
        request,
        admin,
        action="support.ticket.update",
        module="support",
        target_type="ticket",
        target_id=ticket_id,
        reason=payload.resolution or "Ticket updated",
        before=before[0],
        after=values,
    )
    return {"ok": True, "ticket": updated[0] if updated else None}


@router.post("/support/tickets/{ticket_id}/messages")
async def reply(
    ticket_id: str,
    payload: TicketMessage,
    request: Request,
    admin: AdminActor = Depends(require_permission("support.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Post a reply or an internal note.

    An internal note is stored with `is_internal` so the user-facing ticket
    screen can filter it out; it is never delivered to the user.
    """
    exists = await store.select("support_tickets", columns="id", filters={"id": f"eq.{ticket_id}"})
    if not exists:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    created = await store.insert(
        "support_messages",
        {
            "ticket_id": ticket_id,
            "author_id": admin.user_id,
            "author_kind": "admin",
            "body": payload.body.strip(),
            "is_internal": payload.is_internal,
        },
    )
    await store.update(
        "support_tickets",
        {"status": "waiting_user" if not payload.is_internal else "in_progress"},
        filters={"id": f"eq.{ticket_id}"},
    )
    # Replies are user-visible content, not an internal decision: only notes go
    # to the audit trail with their body, and that body is admin-authored.
    await audit(
        store,
        request,
        admin,
        action="support.message.add",
        module="support",
        target_type="ticket",
        target_id=ticket_id,
        reason="Internal note" if payload.is_internal else "Reply to user",
    )
    return {"ok": True, "message": created[0] if created else None}


# ── Notifications & announcements ─────────────────────────────────────────


@router.get("/campaigns", response_model=Page)
async def campaigns(
    pagination: Annotated[Pagination, Depends()],
    admin: AdminActor = Depends(require_permission("notifications.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    rows, total = await store.select(
        "notification_campaigns",
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/campaigns")
async def create_campaign(
    payload: CampaignCreate,
    request: Request,
    admin: AdminActor = Depends(require_permission("notifications.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Create an announcement.

    It is stored as a draft/scheduled campaign. Delivery is a background job:
    an admin creating an announcement must not wait on (or be able to fan out)
    a million-row write inside a request.
    """
    status_value = "scheduled" if payload.scheduled_at else "draft"
    created = await store.insert(
        "notification_campaigns",
        {
            "title": payload.title,
            "body": payload.body,
            "channel": payload.channel,
            "audience_roles": payload.audience_roles,
            "audience_states": payload.audience_states,
            "status": status_value,
            "scheduled_at": payload.scheduled_at,
            "created_by": admin.user_id,
        },
    )
    await audit(
        store,
        request,
        admin,
        action="notifications.campaign.create",
        module="notifications",
        target_type="campaign",
        target_id=str(created[0]["id"]) if created else None,
        reason="Announcement created",
        after={"title": payload.title, "audience_roles": payload.audience_roles, "status": status_value},
    )
    return {"ok": True, "campaign": created[0] if created else None}


@router.post("/campaigns/{campaign_id}/cancel")
async def cancel_campaign(
    campaign_id: str,
    request: Request,
    reason: str = Query(min_length=3, max_length=300),
    admin: AdminActor = Depends(require_permission("notifications.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select("notification_campaigns", columns="id,status", filters={"id": f"eq.{campaign_id}"})
    if not rows:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if rows[0].get("status") == "sent":
        raise HTTPException(status_code=409, detail="A sent announcement cannot be cancelled.")
    await store.update("notification_campaigns", {"status": "cancelled"}, filters={"id": f"eq.{campaign_id}"})
    await audit(
        store,
        request,
        admin,
        action="notifications.campaign.cancel",
        module="notifications",
        target_type="campaign",
        target_id=campaign_id,
        reason=reason,
        before={"status": rows[0].get("status")},
        after={"status": "cancelled"},
    )
    return {"ok": True}


# ── CMS ───────────────────────────────────────────────────────────────────


@router.get("/cms", response_model=Page)
async def cms_pages(
    pagination: Annotated[Pagination, Depends()],
    kind: str | None = Query(default=None, max_length=20),
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    admin: AdminActor = Depends(require_permission("cms.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    if kind:
        filters["kind"] = f"eq.{kind}"
    if status_filter:
        filters["status"] = f"eq.{status_filter}"
    rows, total = await store.select(
        "cms_pages",
        order="updated_at.desc",
        filters=filters,
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.put("/cms/{slug}")
async def save_cms_page(
    slug: str,
    request: Request,
    title: str = Query(min_length=2, max_length=160),
    kind: str = Query(default="page", pattern=r"^(banner|page|faq|terms|privacy|education)$"),
    content: str = Query(default="", max_length=100_000),
    admin: AdminActor = Depends(require_permission("cms.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Save a draft. Publishing is a separate permission (`cms.publish`)."""
    existing = await store.select("cms_pages", columns="id,status", filters={"slug": f"eq.{slug}"})
    values = {"title": title, "kind": kind, "content": content, "updated_by": admin.user_id}
    if existing:
        # A published page always drops back to review: edits must be approved.
        values["status"] = "review" if existing[0].get("status") == "published" else existing[0]["status"]
        updated = await store.update("cms_pages", values, filters={"slug": f"eq.{slug}"})
        created = updated[0] if updated else None
    else:
        values.update(slug=slug, status="draft")
        inserted = await store.insert("cms_pages", values)
        created = inserted[0] if inserted else None

    await audit(
        store,
        request,
        admin,
        action="cms.save",
        module="cms",
        target_type="cms_page",
        target_id=slug,
        reason="Content saved",
        after={"title": title, "kind": kind, "status": values.get("status")},
    )
    return {"ok": True, "page": created}


@router.post("/cms/{slug}/publish")
async def publish_cms_page(
    slug: str,
    request: Request,
    reason: str = Query(min_length=3, max_length=300),
    admin: AdminActor = Depends(require_permission("cms.publish")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select("cms_pages", columns="slug,status", filters={"slug": f"eq.{slug}"})
    if not rows:
        raise HTTPException(status_code=404, detail="CMS page not found.")
    now = datetime.now(tz=timezone.utc).isoformat()
    await store.update(
        "cms_pages", {"status": "published", "published_at": now}, filters={"slug": f"eq.{slug}"}
    )
    await audit(
        store,
        request,
        admin,
        action="cms.publish",
        module="cms",
        target_type="cms_page",
        target_id=slug,
        reason=reason,
        before={"status": rows[0].get("status")},
        after={"status": "published"},
    )
    return {"ok": True}


# ── Platform settings + feature flags ─────────────────────────────────────


@router.get("/settings")
async def list_settings(
    admin: AdminActor = Depends(require_permission("settings.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.all_pages(
        "platform_settings", columns="key,value,category,label,kind,updated_at"
    )
    for row in rows:
        if row.get("kind") == "secret":
            # Never return the value, even to a settings admin.
            row["value"] = SECRET_MASK
            row["is_set"] = bool(row.get("value"))
    return {"rows": rows}


@router.patch("/settings")
async def update_settings(
    payload: SettingsUpdate,
    request: Request,
    admin: AdminActor = Depends(require_permission("settings.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Update settings in bulk.

    A `secret` setting is written but never read back. A blank secret means
    "leave unchanged", so saving the form without retyping a key cannot wipe it.
    """
    known = {r["key"]: r for r in await store.all_pages("platform_settings", columns="key,kind,value")}
    unknown = [k for k in payload.values if k not in known]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown setting: {unknown[0]}")

    changed: dict[str, Any] = {}
    for key, value in payload.values.items():
        if known[key].get("kind") == "secret" and value in ("", SECRET_MASK, None):
            continue
        await store.update(
            "platform_settings",
            {"value": value, "updated_by": admin.user_id, "updated_at": datetime.now(tz=timezone.utc).isoformat()},
            filters={"key": f"eq.{key}"},
        )
        changed[key] = SECRET_MASK if known[key].get("kind") == "secret" else value

    await audit(
        store,
        request,
        admin,
        action="settings.update",
        module="settings",
        target_type="platform_settings",
        reason=payload.reason,
        after=changed,
    )
    return {"ok": True, "updated": sorted(changed)}


@router.get("/flags")
async def list_flags(
    admin: AdminActor = Depends(require_permission("settings.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    return {"rows": await store.all_pages("feature_flags", columns="key,description,enabled,payload,updated_at")}


@router.patch("/flags/{key}")
async def update_flag(
    key: str,
    payload: FlagUpdate,
    request: Request,
    admin: AdminActor = Depends(require_permission("settings.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select("feature_flags", columns="key,enabled", filters={"key": f"eq.{key}"})
    if not rows:
        raise HTTPException(status_code=404, detail="Feature flag not found.")
    await store.update(
        "feature_flags",
        {"enabled": payload.enabled, "payload": payload.payload, "updated_by": admin.user_id},
        filters={"key": f"eq.{key}"},
    )
    await audit(
        store,
        request,
        admin,
        action="settings.flag.update",
        module="settings",
        target_type="feature_flag",
        target_id=key,
        reason=payload.reason,
        before={"enabled": rows[0].get("enabled")},
        after={"enabled": payload.enabled},
    )
    return {"ok": True}
