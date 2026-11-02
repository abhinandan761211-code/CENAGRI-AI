"""Content, Kisan Video Hub and creator moderation.

The creator system already exists (`creator.sql`) — this module edits its rows,
it does not introduce a second one. Every action is:

1. written to `moderation_actions` (a permanent history for that entity), and
2. appended to `admin_audit_logs` (the platform-wide trail),
so "who hid this video and why" is answerable months later from either table.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import ModerationRequest, Page, Pagination

router = APIRouter()

VIDEO_COLUMNS = (
    "id,title,status,visibility,kind,category,creator_id,owner_id,view_count,like_count,"
    "comment_count,duration_sec,thumbnail_url,published_at,created_at,is_featured,is_hidden"
)

# Content actions → the columns they change. Anything not listed here cannot be
# done through this endpoint, which keeps "remove" from quietly meaning "delete".
VIDEO_EFFECTS: dict[str, dict[str, Any]] = {
    "approve": {"status": "published", "is_hidden": False},
    "reject": {"status": "review", "is_hidden": True},
    "hide": {"is_hidden": True},
    "remove": {"is_hidden": True, "status": "review"},
    "restore": {"is_hidden": False},
    "feature": {"is_featured": True},
    "unfeature": {"is_featured": False},
}

CREATOR_METHODS = {"restrict"}  # restrict a creator from publishing


def _paged(rows: list[dict], total: int | None, pagination: Pagination) -> Page:
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


async def _record(
    store: AdminStore,
    request: Request,
    admin: AdminActor,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    reason: str | None,
    module: str,
    before: Any = None,
    after: Any = None,
) -> None:
    """Moderation history + platform audit trail, in that order."""
    await store.insert(
        "moderation_actions",
        {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "reason": reason,
            "admin_id": admin.user_id,
        },
        returning=False,
    )
    await audit(
        store,
        request,
        admin,
        action=f"{entity_type}.{action}",
        module=module,
        target_type=entity_type,
        target_id=entity_id,
        reason=reason,
        before=before,
        after=after,
    )


# ── Videos / Shorts ───────────────────────────────────────────────────────


@router.get("/videos", response_model=Page)
async def list_videos(
    pagination: Annotated[Pagination, Depends()],
    q: str | None = Query(default=None, max_length=80),
    kind: str | None = Query(default=None, pattern=r"^(video|short)$"),
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    hidden: bool | None = Query(default=None),
    featured: bool | None = Query(default=None),
    admin: AdminActor = Depends(require_permission("hubs.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    or_filter = None
    if q and q.strip():
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"title.ilike.*{safe}*"
    if kind:
        filters["kind"] = f"eq.{kind}"
    if status_filter:
        filters["status"] = f"eq.{status_filter}"
    if hidden is not None:
        filters["is_hidden"] = f"eq.{str(hidden).lower()}"
    if featured is not None:
        filters["is_featured"] = f"eq.{str(featured).lower()}"

    rows, total = await store.select(
        "videos",
        columns=VIDEO_COLUMNS,
        filters=filters,
        or_filter=or_filter,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    creators = await _creators_for(store, [r.get("creator_id") for r in rows])
    for row in rows:
        row["creator"] = creators.get(row.get("creator_id"))
    return _paged(rows, total, pagination)


@router.post("/videos/{video_id}/action")
async def moderate_video(
    video_id: str,
    payload: ModerationRequest,
    request: Request,
    admin: AdminActor = Depends(require_permission("content.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    effects = VIDEO_EFFECTS.get(payload.action)
    if not effects:
        raise HTTPException(status_code=422, detail="That action is not available for a video.")
    if payload.action in {"hide", "remove", "reject"} and not (payload.reason or "").strip():
        raise HTTPException(status_code=422, detail="Give a reason — the creator is told why.")

    rows = await store.select(
        "videos", columns="id,status,is_hidden,is_featured", filters={"id": f"eq.{video_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Video not found.")
    before = rows[0]

    updated = await store.update("videos", effects, filters={"id": f"eq.{video_id}"})
    await _record(
        store,
        request,
        admin,
        entity_type="video",
        entity_id=video_id,
        action=payload.action,
        reason=payload.reason,
        module="video_hub",
        before=before,
        after=effects,
    )
    return {"ok": True, "video": updated[0] if updated else None}


@router.post("/videos/{video_id}/feature")
async def toggle_feature(
    video_id: str,
    request: Request,
    enabled: bool = Query(...),
    admin: AdminActor = Depends(require_permission("content.feature")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Pin or unpin a video in the hub's featured row."""
    updated = await store.update("videos", {"is_featured": enabled}, filters={"id": f"eq.{video_id}"})
    if not updated:
        raise HTTPException(status_code=404, detail="Video not found.")
    await _record(
        store,
        request,
        admin,
        entity_type="video",
        entity_id=video_id,
        action="feature" if enabled else "unfeature",
        reason="Featured row in Kisan Video Hub",
        module="video_hub",
        after={"is_featured": enabled},
    )
    return {"ok": True}


@router.get("/videos/{video_id}/history")
async def video_history(
    video_id: str,
    admin: AdminActor = Depends(require_permission("content.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select(
        "moderation_actions",
        columns="id,action,reason,admin_id,created_at",
        filters={"entity_type": "eq.video", "entity_id": f"eq.{video_id}"},
        order="created_at.desc",
        limit=100,
    )
    return {"rows": rows}


# ── Reports ───────────────────────────────────────────────────────────────


@router.get("/reports", response_model=Page)
async def list_reports(
    pagination: Annotated[Pagination, Depends()],
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    admin: AdminActor = Depends(require_permission("content.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters = {"status": f"eq.{status_filter}"} if status_filter else {}
    rows, total = await store.select(
        "video_reports",
        columns="id,reporter_id,video_id,comment_id,reason,note,status,created_at",
        filters=filters,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return _paged(rows, total, pagination)


@router.post("/reports/{report_id}")
async def resolve_report(
    report_id: str,
    payload: ModerationRequest,
    request: Request,
    admin: AdminActor = Depends(require_permission("content.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Close a report: ``actioned`` (was valid) or ``dismissed`` (was not)."""
    if payload.action not in {"approve", "reject"}:
        raise HTTPException(status_code=422, detail="Decide a report with approve or reject.")
    status_value = "actioned" if payload.action == "approve" else "dismissed"

    rows = await store.select("video_reports", columns="id,status", filters={"id": f"eq.{report_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found.")
    if rows[0].get("status") in {"actioned", "dismissed"}:
        raise HTTPException(status_code=409, detail="This report is already closed.")

    await store.update("video_reports", {"status": status_value}, filters={"id": f"eq.{report_id}"})
    await _record(
        store,
        request,
        admin,
        entity_type="video",
        entity_id=report_id,
        action=f"report.{status_value}",
        reason=payload.reason,
        module="content",
        before={"report_status": rows[0].get("status")},
        after={"report_status": status_value},
    )
    return {"ok": True}


# ── Comments ──────────────────────────────────────────────────────────────


@router.get("/comments", response_model=Page)
async def list_comments(
    pagination: Annotated[Pagination, Depends()],
    video_id: str | None = Query(default=None, max_length=40),
    admin: AdminActor = Depends(require_permission("content.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters = {"video_id": f"eq.{video_id}"} if video_id else {}
    rows, total = await store.select(
        "video_comments",
        columns="id,author_id,video_id,body,created_at,parent_id",
        filters=filters,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return _paged(rows, total, pagination)


@router.delete("/comments/{comment_id}")
async def hide_comment(
    comment_id: str,
    request: Request,
    reason: str = Query(default="Moderated", max_length=300),
    admin: AdminActor = Depends(require_permission("content.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Remove a comment.

    A comment is the one content type where a hard delete is acceptable: it has
    no dependent records and the user can be told why. It is still recorded in
    the moderation history with the (now-deleted) id.
    """
    rows = await store.select(
        "video_comments", columns="id,body,video_id,author_id", filters={"id": f"eq.{comment_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Comment not found.")
    await store.delete("video_comments", filters={"id": f"eq.{comment_id}"})
    await _record(
        store,
        request,
        admin,
        entity_type="comment",
        entity_id=comment_id,
        action="remove",
        reason=reason,
        module="content",
        before={"video_id": rows[0].get("video_id"), "author_id": rows[0].get("author_id")},
    )
    return {"ok": True}


# ── Creators ──────────────────────────────────────────────────────────────


@router.get("/creators", response_model=Page)
async def list_creators(
    pagination: Annotated[Pagination, Depends()],
    q: str | None = Query(default=None, max_length=80),
    verified: bool | None = Query(default=None),
    admin: AdminActor = Depends(require_permission("content.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    if verified is not None:
        filters["is_verified"] = f"eq.{str(verified).lower()}"
    or_filter = None
    if q and q.strip():
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"channel_name.ilike.*{safe}*,handle.ilike.*{safe}*"
    rows, total = await store.select(
        "creator_profiles",
        columns=(
            "id,owner_id,channel_name,handle,avatar_url,subscriber_count,video_count,"
            "total_views,is_verified,district,state,created_at"
        ),
        filters=filters,
        or_filter=or_filter,
        order="subscriber_count.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return _paged(rows, total, pagination)


@router.post("/creators/{creator_id}/verify")
async def verify_creator(
    creator_id: str,
    request: Request,
    verified: bool = Query(...),
    reason: str = Query(min_length=3, max_length=300),
    admin: AdminActor = Depends(require_permission("content.creator_manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select(
        "creator_profiles", columns="id,is_verified", filters={"id": f"eq.{creator_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Creator channel not found.")
    await store.update("creator_profiles", {"is_verified": verified}, filters={"id": f"eq.{creator_id}"})
    await _record(
        store,
        request,
        admin,
        entity_type="profile",
        entity_id=creator_id,
        action="verify" if verified else "unverify",
        reason=reason,
        module="creators",
        before={"is_verified": rows[0].get("is_verified")},
        after={"is_verified": verified},
    )
    return {"ok": True}


# ── Categories ────────────────────────────────────────────────────────────


@router.get("/categories")
async def list_categories(
    admin: AdminActor = Depends(require_permission("hubs.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.select("video_categories", columns="slug,label,sort_order", order="sort_order.asc")
    return {"rows": rows}


@router.post("/categories")
async def upsert_category(
    request: Request,
    slug: str = Query(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$"),
    label: str = Query(min_length=2, max_length=80),
    admin: AdminActor = Depends(require_permission("content.feature")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    existing = await store.select("video_categories", columns="slug", filters={"slug": f"eq.{slug}"})
    if existing:
        await store.update("video_categories", {"label": label}, filters={"slug": f"eq.{slug}"})
        action = "categories.update"
    else:
        await store.insert("video_categories", {"slug": slug, "label": label}, returning=False)
        action = "categories.create"
    await audit(
        store,
        request,
        admin,
        action=action,
        module="video_hub",
        target_type="video_category",
        target_id=slug,
        reason="Category maintained from the admin panel",
        after={"label": label},
    )
    return {"ok": True}


# ── Posts (CenFriend + creator channel posts) ─────────────────────────────


@router.get("/posts", response_model=Page)
async def list_posts(
    pagination: Annotated[Pagination, Depends()],
    source: str = Query(default="cenfriend", pattern=r"^(cenfriend|creator)$"),
    admin: AdminActor = Depends(require_permission("content.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    table = "posts" if source == "cenfriend" else "creator_posts"
    columns = "id,body,created_at" if source == "cenfriend" else "id,body,created_at,creator_id"
    rows, total = await store.select(
        table,
        columns=columns,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return _paged(rows, total, pagination)


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    request: Request,
    source: str = Query(default="cenfriend", pattern=r"^(cenfriend|creator)$"),
    reason: str = Query(min_length=3, max_length=300),
    admin: AdminActor = Depends(require_permission("content.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    table = "posts" if source == "cenfriend" else "creator_posts"
    rows = await store.select(table, columns="id,body", filters={"id": f"eq.{post_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found.")
    await store.delete(table, filters={"id": f"eq.{post_id}"})
    await _record(
        store,
        request,
        admin,
        entity_type="post",
        entity_id=post_id,
        action="remove",
        reason=reason,
        module="content",
    )
    return {"ok": True}


async def _creators_for(store: AdminStore, ids: list[str | None]) -> dict[str, dict[str, Any]]:
    clean = [i for i in ids if i]
    if not clean:
        return {}
    try:
        rows = await store.select(
            "creator_profiles", columns="id,channel_name,handle,is_verified", filters={"id": f"in.({','.join(clean)})"}
        )
        return {r["id"]: r for r in rows}
    except AdminStoreError:
        return {}
