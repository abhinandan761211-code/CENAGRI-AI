"""User management.

Supported account types are the ones the app actually creates (the
``profiles_role_check`` values), so this module never invents a role that
signup cannot produce.

Safety rules baked in here:

* **No hard delete.** Status is a soft lock (``suspended`` / ``blocked``);
  deleting a person's data is a separate, recorded decision in
  ``admin_deletion_requests``.
* **Typed confirmation.** Changing status requires echoing the account's email,
  which makes an accidental click in the wrong row harmless.
* **Every write is audited** with a reason, the acting admin and the before /
  after status.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import AccountAction, Page, Pagination

router = APIRouter()

ROLES = [
    "Farmer",
    "Buyer",
    "Retailer",
    "Shop",
    "Worker",
    "Equipment",
    "Transporter",
    "Warehouse",
    "Content Creator",
]

LIST_COLUMNS = "id,full_name,email,phone,role,account_status,status_reason,created_at,last_active_at,avatar_url,details"

# Only these keys of `details` are ever shown in the list/detail view.
SAFE_DETAIL_KEYS = ("state", "district", "village", "crops", "vehicle_type", "shop_name", "company")


def _safe_profile(row: dict[str, Any]) -> dict[str, Any]:
    details = row.get("details") or {}
    if not isinstance(details, dict):
        details = {}
    return {
        "id": row.get("id"),
        "full_name": row.get("full_name"),
        "email": row.get("email"),
        "phone": row.get("phone"),
        "role": row.get("role"),
        "account_status": row.get("account_status") or "active",
        "status_reason": row.get("status_reason"),
        "created_at": row.get("created_at"),
        "last_active_at": row.get("last_active_at"),
        "avatar_url": row.get("avatar_url"),
        "location": {
            "state": details.get("state"),
            "district": details.get("district"),
            "village": details.get("village"),
        },
        "details": {k: details[k] for k in SAFE_DETAIL_KEYS if k in details},
    }


def _filters(
    *,
    q: str | None,
    role: str | None,
    status: str | None,
    state: str | None,
    district: str | None,
    created_from: str | None,
    created_to: str | None,
) -> tuple[dict[str, str], str | None]:
    """PostgREST filters for the list. Mirrors the UI's filter controls."""
    filters: dict[str, str] = {}
    or_filter: str | None = None

    if q and q.strip():
        # `or` is a single PostgREST expression across several columns.
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"full_name.ilike.*{safe}*,email.ilike.*{safe}*,phone.ilike.*{safe}*"
    if role:
        if role not in ROLES:
            raise HTTPException(status_code=422, detail="Unknown account type.")
        filters["role"] = f"eq.{role}"
    if status:
        if status not in {"active", "pending", "suspended", "blocked"}:
            raise HTTPException(status_code=422, detail="Unknown account status.")
        filters["account_status"] = f"eq.{status}"
    if state:
        filters["details->>state"] = f"eq.{state}"
    if district:
        filters["details->>district"] = f"eq.{district}"
    if created_from:
        filters["created_at"] = f"gte.{created_from}"
    if created_to:
        filters["created_at"] = f"lte.{created_to}T23:59:59"
    return filters, or_filter


@router.get("/roles")
def roles() -> dict[str, list[str]]:
    """The account types the platform actually supports."""
    return {"roles": ROLES}


@router.get("", response_model=Page)
async def list_users(
    pagination: Annotated[Pagination, Depends()],
    q: str | None = Query(default=None, max_length=80),
    role: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, max_length=20),
    state: str | None = Query(default=None, max_length=80),
    district: str | None = Query(default=None, max_length=80),
    created_from: str | None = Query(default=None, max_length=20),
    created_to: str | None = Query(default=None, max_length=20),
    admin: AdminActor = Depends(require_permission("users.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters, or_filter = _filters(
        q=q,
        role=role,
        status=status,
        state=state,
        district=district,
        created_from=created_from,
        created_to=created_to,
    )
    rows, total = await store.select(
        "profiles",
        columns=LIST_COLUMNS,
        filters=filters,
        or_filter=or_filter,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(
        rows=[_safe_profile(r) for r in rows],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/export")
async def export_users(
    request: Request,
    q: str | None = Query(default=None, max_length=80),
    role: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, max_length=20),
    admin: AdminActor = Depends(require_permission("users.export")),
    store: AdminStore = Depends(get_admin_db),
) -> StreamingResponse:
    """CSV export of authorised user records.

    Exports are audited (who, what filter, how many rows) because they are the
    easiest way to remove data from the platform. Documents and internal notes
    are never included.
    """
    filters, or_filter = _filters(
        q=q, role=role, status=status, state=None, district=None, created_from=None, created_to=None
    )
    rows, total = await store.select(
        "profiles",
        columns=LIST_COLUMNS,
        filters=filters,
        or_filter=or_filter,
        order="created_at.desc",
        limit=1000,
        count=True,
    )

    await audit(
        store,
        request,
        admin,
        action="users.export",
        module="users",
        target_type="export",
        reason=f"role={role or 'all'} status={status or 'all'} q={q or '-'}",
        after={"rows": len(rows), "total": total},
    )

    def generate():
        header = "id,full_name,email,phone,role,status,state,district,created_at,last_active_at\n"
        yield header
        for row in rows:
            profile = _safe_profile(row)
            values = [
                profile["id"],
                profile["full_name"],
                profile["email"],
                profile["phone"],
                profile["role"],
                profile["account_status"],
                profile["location"]["state"],
                profile["location"]["district"],
                profile["created_at"],
                profile["last_active_at"],
            ]
            yield ",".join(_csv(value) for value in values) + "\n"

    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d-%H%M")
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cenagri-users-{stamp}.csv"'},
    )


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    admin: AdminActor = Depends(require_permission("users.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """One account with its activity counters."""
    rows = await store.select(
        "profiles", columns=LIST_COLUMNS, filters={"id": f"eq.{user_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found.")
    profile = _safe_profile(rows[0])

    async def _c(table: str, column: str) -> int | None:
        try:
            _, total = await store.select(
                table, columns=column, filters={column: f"eq.{user_id}"}, limit=1, count=True
            )
            return total
        except AdminStoreError:
            return None

    import asyncio

    farm, listings, orders_bought, orders_sold, videos, posts = await asyncio.gather(
        _c("farms", "owner_id"),
        _c("listings", "seller_id"),
        _c("orders", "buyer_id"),
        _c("retailer_orders", "owner_id"),
        _c("videos", "owner_id"),
        _c("posts", "author_id"),
    )

    try:
        open_reports = await store.select(
            "video_reports",
            columns="id,reason,status,created_at",
            filters={"reporter_id": f"eq.{user_id}"},
            order="created_at.desc",
            limit=10,
        )
    except AdminStoreError:
        open_reports = []

    return {
        "profile": profile,
        "activity": {
            "farms": farm,
            "listings": listings,
            "orders_as_buyer": orders_bought,
            "orders_as_seller": orders_sold,
            "videos": videos,
            "posts": posts,
        },
        "reports_filed": open_reports,
    }


@router.post("/{user_id}/status")
async def set_status(
    user_id: str,
    payload: AccountAction,
    request: Request,
    admin: AdminActor = Depends(require_permission("users.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Suspend, block, reactivate or re-open an account for review."""
    rows = await store.select(
        "profiles",
        columns="id,email,account_status,status_reason",
        filters={"id": f"eq.{user_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found.")
    current = rows[0]

    if (current.get("email") or "").strip().lower() != payload.confirm_email.strip().lower():
        raise HTTPException(
            status_code=422,
            detail="The confirmation email does not match this account. Nothing was changed.",
        )
    if current.get("account_status") == payload.status:
        raise HTTPException(status_code=409, detail="The account is already in that state.")

    now = datetime.now(tz=timezone.utc).isoformat()
    updated = await store.update(
        "profiles",
        {
            "account_status": payload.status,
            "status_reason": payload.reason,
            "status_changed_at": now,
        },
        filters={"id": f"eq.{user_id}"},
    )

    await audit(
        store,
        request,
        admin,
        action=f"users.status.{payload.status}",
        module="users",
        target_type="profile",
        target_id=user_id,
        reason=payload.reason,
        before={"account_status": current.get("account_status")},
        after={"account_status": payload.status},
    )
    return {"ok": True, "profile": _safe_profile(updated[0]) if updated else None}


@router.get("/{user_id}/audit")
async def user_audit(
    user_id: str,
    admin: AdminActor = Depends(require_permission("security.audit")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Admin actions taken on one account — who, what, when, why."""
    rows = await store.select(
        "admin_audit_logs",
        columns="id,admin_email,admin_role,action,module,reason,before_state,after_state,created_at",
        filters={"target_type": "eq.profile", "target_id": f"eq.{user_id}"},
        order="created_at.desc",
        limit=50,
    )
    return {"rows": rows}


def _csv(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if any(ch in text for ch in [",", '"', "\n"]):
        return '"' + text.replace('"', '""') + '"'
    return text
