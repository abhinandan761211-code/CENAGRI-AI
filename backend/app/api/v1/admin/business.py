"""Marketplace, orders, CenFriend and finance.

Read-heavy by design: the panel shows a business administrator what exists and
lets them act on the narrow set of things that genuinely need an admin (listing
moderation, order status, refund authorisation). Payments themselves stay with
the provider — there is no card data in this schema and none is accepted here.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import ModerationRequest, Page, Pagination

router = APIRouter()

ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"]

# The two order tables were written at different times and do not share column
# names. Mapping them here keeps the routes readable and makes the difference
# explicit instead of hiding it behind a generic query.
ORDER_SOURCES: dict[str, dict[str, Any]] = {
    "retailer": {
        "table": "retailer_orders",
        "buyer": "customer_id",
        "amount": "amount_inr",
        "statuses": ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"],
    },
    "marketplace": {
        "table": "orders",
        "buyer": "buyer_id",
        "amount": "amount_inr",
        "statuses": ["pending", "confirmed", "delivered", "cancelled"],
    },
}


# ── Marketplace ───────────────────────────────────────────────────────────


@router.get("/listings", response_model=Page)
async def listings(
    pagination: Annotated[Pagination, Depends()],
    q: str | None = Query(default=None, max_length=80),
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    admin: AdminActor = Depends(require_permission("marketplace.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    if status_filter:
        filters["status"] = f"eq.{status_filter}"
    or_filter = None
    if q and q.strip():
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"title.ilike.*{safe}*"
    try:
        rows, total = await store.select(
            "listings",
            columns="id,seller_id,title,category,quantity_kg,price_inr,unit,district,state,status,created_at",
            filters=filters,
            or_filter=or_filter,
            order="created_at.desc",
            limit=pagination.page_size,
            offset=pagination.offset,
            count=True,
        )
        # Show the seller's name, not a UUID.
        seller_ids = [r["seller_id"] for r in rows if r.get("seller_id")]
        sellers: dict[str, Any] = {}
        if seller_ids:
            people = await store.select(
                "profiles",
                columns="id,full_name,email,role",
                filters={"id": f"in.({','.join(seller_ids)})"},
            )
            sellers = {p["id"]: p for p in people}
        for row in rows:
            row["seller"] = sellers.get(row.get("seller_id"))
    except AdminStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/listings/{listing_id}/action")
async def moderate_listing(
    listing_id: str,
    payload: ModerationRequest,
    request: Request,
    admin: AdminActor = Depends(require_permission("marketplace.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Archive a listing (hide) or put it back on the marketplace (restore)."""
    if payload.action not in {"hide", "restore"}:
        raise HTTPException(status_code=422, detail="A listing can be archived or restored.")
    if not (payload.reason or "").strip():
        raise HTTPException(status_code=422, detail="Give a reason for the change.")

    rows = await store.select("listings", columns="id,status", filters={"id": f"eq.{listing_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="Listing not found.")
    new_status = "active" if payload.action == "restore" else "archived"
    await store.update("listings", {"status": new_status}, filters={"id": f"eq.{listing_id}"})
    await audit(
        store,
        request,
        admin,
        action=f"marketplace.listing.{payload.action}",
        module="marketplace",
        target_type="listing",
        target_id=listing_id,
        reason=payload.reason,
        before={"status": rows[0].get("status")},
        after={"status": new_status},
    )
    return {"ok": True, "status": new_status}


@router.get("/retailer-products", response_model=Page)
async def retailer_products(
    pagination: Annotated[Pagination, Depends()],
    q: str | None = Query(default=None, max_length=80),
    admin: AdminActor = Depends(require_permission("marketplace.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    or_filter = None
    if q and q.strip():
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"name.ilike.*{safe}*,brand.ilike.*{safe}*"
    rows, total = await store.select(
        "retailer_products",
        # Column names come from retailer.sql: the shop side is retailer_id, the
        # price is price_inr and the status is `status` ('active' | 'paused' |
        # 'archived'). There is no owner_id / price / stock / is_active column, and
        # asking for one failed the whole page with 42703.
        columns="id,retailer_id,name,brand,category,price_inr,stock_qty,unit,status,created_at",
        or_filter=or_filter,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/products/{product_id}/action")
async def moderate_product(
    product_id: str,
    payload: ModerationRequest,
    request: Request,
    admin: AdminActor = Depends(require_permission("marketplace.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Hide or restore a shop product."""
    if payload.action not in {"hide", "restore", "remove"}:
        raise HTTPException(status_code=422, detail="A product can be hidden, removed or restored.")
    if not (payload.reason or "").strip():
        raise HTTPException(status_code=422, detail="Give a reason for the change.")

    rows = await store.select(
        "retailer_products", columns="id,name,status", filters={"id": f"eq.{product_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Product not found.")
    # `status` is the real column; hiding a product pauses the listing without
    # destroying the price history, and restoring puts it back on sale.
    status = "active" if payload.action == "restore" else "paused"
    updated = await store.update("retailer_products", {"status": status}, filters={"id": f"eq.{product_id}"})
    await audit(
        store,
        request,
        admin,
        action=f"marketplace.product.{payload.action}",
        module="marketplace",
        target_type="product",
        target_id=product_id,
        reason=payload.reason,
        before={"status": rows[0].get("status")},
        after={"status": status},
    )
    return {"ok": True, "product": updated[0] if updated else None}


# ── Orders ────────────────────────────────────────────────────────────────

# Column names differ between the two order tables; pick the right set per
# source instead of pretending they are identical.
ORDER_COLUMNS = {
    # retailer.sql: the shop is `retailer_id` (there is no owner_id) and the
    # order is stamped `placed_at`, not created_at.
    "retailer": "id,retailer_id,customer_id,customer_name,amount_inr,status,placed_at",
    "marketplace": "id,buyer_id,seller_id,amount_inr,status,created_at",
}


@router.get("/orders", response_model=Page)
async def orders(
    pagination: Annotated[Pagination, Depends()],
    source: str = Query(default="retailer", pattern=r"^(retailer|marketplace)$"),
    status_filter: str | None = Query(default=None, alias="status", max_length=20),
    admin: AdminActor = Depends(require_permission("orders.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    spec = ORDER_SOURCES[source]
    if status_filter and status_filter not in spec["statuses"]:
        raise HTTPException(status_code=422, detail="Unknown order status for this order source.")
    filters = {"status": f"eq.{status_filter}"} if status_filter else {}
    # `placed_at` is the order date on retailer_orders; marketplace orders only
    # have created_at. Sorting on a missing column is another 42703.
    order_by = "placed_at.desc" if source == "retailer" else "created_at.desc"
    try:
        rows, total = await store.select(
            spec["table"],
            columns=ORDER_COLUMNS[source],
            filters=filters,
            order=order_by,
            limit=pagination.page_size,
            offset=pagination.offset,
            count=True,
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.patch("/orders/{order_id}")
async def update_order(
    order_id: str,
    request: Request,
    source: str = Query(default="retailer", pattern=r"^(retailer|marketplace)$"),
    status_value: str = Query(alias="status", max_length=20),
    reason: str = Query(min_length=3, max_length=300),
    admin: AdminActor = Depends(require_permission("orders.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    spec = ORDER_SOURCES[source]
    if status_value not in spec["statuses"]:
        raise HTTPException(
            status_code=422,
            detail=f"Status must be one of: {', '.join(spec['statuses'])}.",
        )
    rows = await store.select(
        spec["table"], columns="id,status", filters={"id": f"eq.{order_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Order not found.")
    await store.update(spec["table"], {"status": status_value}, filters={"id": f"eq.{order_id}"})
    await audit(
        store,
        request,
        admin,
        action="orders.status.update",
        module="orders",
        target_type="order",
        target_id=order_id,
        reason=reason,
        before={"status": rows[0].get("status")},
        after={"status": status_value},
    )
    return {"ok": True, "status": status_value}


@router.post("/orders/{order_id}/refund")
async def record_refund(
    order_id: str,
    request: Request,
    source: str = Query(default="retailer", pattern=r"^(retailer|marketplace)$"),
    amount: float = Query(gt=0),
    reason: str = Query(min_length=10, max_length=500),
    admin: AdminActor = Depends(require_permission("finance.refund")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Record a refund against an order.

    Two different outcomes, both honest:

    * the order table has a refundable amount column → the amount is written
      back and the customer-facing screen reflects it;
    * it does not (the retailer order table has no refund column today) → the
      decision is still recorded in the audit log, and the response says so
      instead of pretending the order changed.

    No money moves here: this endpoint records a decision, which is all an admin
    panel should do without a payment provider integration. The minimum reason
    length is deliberate — a refund is irreversible and the audit row is what
    finance reviews later.
    """
    spec = ORDER_SOURCES[source]
    rows = await store.select(
        spec["table"], columns=f"id,{spec['amount']}", filters={"id": f"eq.{order_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Order not found.")
    total = float(rows[0].get(spec["amount"]) or 0)
    if amount > total:
        raise HTTPException(status_code=422, detail="The refund is larger than the order total.")

    values: dict[str, Any] = {spec["amount"]: total - amount}
    recorded = True
    try:
        await store.update(spec["table"], values, filters={"id": f"eq.{order_id}"})
    except AdminStoreError:
        # No refundable column on this order table. The audit trail is still the
        # authoritative record of the decision; nothing is silently dropped.
        recorded = False

    await audit(
        store,
        request,
        admin,
        action="finance.refund",
        module="finance",
        target_type="order",
        target_id=order_id,
        reason=reason,
        before={"amount_inr": total},
        after={"amount_inr": total - amount, "refunded": amount},
    )
    return {
        "ok": True,
        "refund_amount": amount,
        "order_updated": recorded,
        "note": None
        if recorded
        else "Recorded in the audit log. This order table has no refund column, so the order total is unchanged.",
    }


# ── CenFriend ─────────────────────────────────────────────────────────────


@router.get("/connections", response_model=Page)
async def connections(
    pagination: Annotated[Pagination, Depends()],
    admin: AdminActor = Depends(require_permission("cenfriend.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    """Follow relationships — who follows whom, never private conversations."""
    try:
        rows, total = await store.select(
            "follows",
            columns="follower_id,following_id,created_at",
            order="created_at.desc",
            limit=pagination.page_size,
            offset=pagination.offset,
            count=True,
        )
    except AdminStoreError:
        rows, total = [], None
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/service-listings", response_model=Page)
async def service_listings(
    pagination: Annotated[Pagination, Depends()],
    kind: str | None = Query(default=None, pattern=r"^(worker|transporter|equipment|warehouse)$"),
    admin: AdminActor = Depends(require_permission("cenfriend.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    """Worker / transporter / equipment listings offered through CenFriend.

    These are the same `profiles` rows the accounts use, filtered by role — the
    app stores availability in `details`, so there is no separate listing table
    to duplicate.
    """
    role_for = {
        "worker": "Worker",
        "transporter": "Transporter",
        "equipment": "Equipment",
        "warehouse": "Warehouse",
    }
    filters: dict[str, str] = {}
    if kind:
        filters["role"] = f"eq.{role_for[kind]}"
    else:
        filters["role"] = "in.(Worker,Transporter,Equipment,Warehouse)"
    rows, total = await store.select(
        "profiles",
        columns="id,full_name,email,phone,role,account_status,details,created_at",
        filters=filters,
        order="created_at.desc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )
    for row in rows:
        details = row.pop("details", None) or {}
        row["availability"] = {
            "state": details.get("state"),
            "district": details.get("district"),
            "vehicle_type": details.get("vehicle_type"),
            "equipment": details.get("equipment"),
        }
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/reports/{profile_id}")
async def flag_profile(
    profile_id: str,
    payload: ModerationRequest,
    request: Request,
    admin: AdminActor = Depends(require_permission("cenfriend.moderate")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Act on a reported profile: restrict it or clear the report.

    Moderation never reads the user's messages. A restriction is recorded in the
    audit trail and in the profile's status, which is all any screen needs.
    """
    if payload.action not in {"restrict", "restore", "approve"}:
        raise HTTPException(status_code=422, detail="Use restrict, restore or approve.")
    if not (payload.reason or "").strip():
        raise HTTPException(status_code=422, detail="Give a reason.")

    rows = await store.select("profiles", columns="id,account_status", filters={"id": f"eq.{profile_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found.")
    new_status = "active" if payload.action in {"restore", "approve"} else "suspended"
    await store.update("profiles", {"account_status": new_status}, filters={"id": f"eq.{profile_id}"})
    await audit(
        store,
        request,
        admin,
        action=f"cenfriend.profile.{payload.action}",
        module="cenfriend",
        target_type="profile",
        target_id=profile_id,
        reason=payload.reason,
        before={"account_status": rows[0].get("account_status")},
        after={"account_status": new_status},
    )
    return {"ok": True}


__all__ = ["router", "ORDER_STATUSES", "ORDER_SOURCES"]
