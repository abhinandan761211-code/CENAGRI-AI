"""Agricultural data: mandi, weather and crop reference data.

This module operates the integrations; it does not become a second source of
truth for government figures. Read the notes per endpoint — several of them say
plainly that the platform keeps no stored copy of a dataset, because it is
better for an admin to see "live fetch only" than to see an empty table
labelled as synced data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.config import settings
from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import Page, Pagination
from app.services import mandi as mandi_service

router = APIRouter()

# Tables the platform owns itself (not government data) — safe to browse here.
CURATED_TABLES = {"crop_categories", "crop_seasons", "crop_stages", "farming_tasks"}
# Government-sourced tables, if a deployment has added them.
EXTERNAL_TABLES = {"mandi_prices"}


@router.get("/mandi/status")
async def mandi_status(
    admin: AdminActor = Depends(require_permission("agri_data.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Whether the mandi feed is configured, and whether prices are stored.

    `storage` is deliberately explicit: this app currently fetches mandi prices
    live from data.gov.in with an in-process cache and does not persist rows.
    If a `mandi_prices` table exists it is reported; if not, that is said
    instead of showing an empty "synced" panel.
    """
    storage: dict[str, Any] = {"table": "mandi_prices", "available": False, "rows": None, "last_at": None}
    try:
        rows, total = await store.select(
            "mandi_prices", columns="fetched_at", order="fetched_at.desc", limit=1, count=True
        )
        storage.update(available=True, rows=total, last_at=rows[0].get("fetched_at") if rows else None)
    except AdminStoreError:
        pass

    return {
        "configured": mandi_service.is_configured(),
        "source": "data.gov.in",
        "base_url": settings.DATA_GOV_BASE_URL,
        "storage": storage,
        "note": (
            "Prices are fetched live and cached in memory; no historical copy is stored."
            if not storage["available"]
            else None
        ),
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
    }


@router.get("/mandi/sample")
async def mandi_sample(
    query: str = Query(default="", max_length=60, description="Commodity or district"),
    limit: int = Query(default=10, ge=1, le=50),
    admin: AdminActor = Depends(require_permission("agri_data.view")),
) -> dict[str, Any]:
    """Fetch a live sample through the app's own mandi service.

    The panel never calls data.gov.in itself — it reuses the service the
    farmers' screens use, so a test here proves what a farmer would see.
    """
    if not mandi_service.is_configured():
        raise HTTPException(status_code=409, detail="The data.gov.in API key is not configured.")
    try:
        rows = await mandi_service.fetch_prices(query=query or None, limit=limit)
    except Exception as exc:  # noqa: BLE001 — the service raises provider errors
        raise HTTPException(status_code=502, detail=f"Mandi provider error: {exc}") from exc
    return {"rows": rows, "source": "data.gov.in", "fetched_at": datetime.now(tz=timezone.utc).isoformat()}


@router.post("/mandi/cache/clear")
async def clear_mandi_cache(
    request: Request,
    admin: AdminActor = Depends(require_permission("agri_data.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Drop the in-process mandi cache so the next request refetches."""
    mandi_service.clear_cache()
    await audit(
        store,
        request,
        admin,
        action="agri.mandi.cache.clear",
        module="agri_data",
        target_type="integration",
        target_id="mandi_cache",
        reason="Cache cleared from the admin panel",
    )
    return {"ok": True}


@router.get("/weather/status")
async def weather_status(
    admin: AdminActor = Depends(require_permission("agri_data.view")),
) -> dict[str, Any]:
    """Weather is served live to the app today; there is no stored feed to report.

    Returning an honest capability statement beats inventing a "last synced"
    timestamp for data the platform does not keep.
    """
    return {
        "configured": False,
        "provider": None,
        "capability": "not_integrated",
        "note": "Weather alerts are not yet backed by a provider integration on the API.",
    }


@router.get("/crops", response_model=Page)
async def crops(
    pagination: Annotated[Pagination, Depends()],
    q: str | None = Query(default=None, max_length=80),
    admin: AdminActor = Depends(require_permission("agri_data.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    or_filter = None
    if q and q.strip():
        safe = q.strip().replace(",", " ").replace("(", "").replace(")", "")
        or_filter = f"name.ilike.*{safe}*"
    try:
        rows, total = await store.select(
            "crops",
            or_filter=or_filter,
            order="name.asc",
            limit=pagination.page_size,
            offset=pagination.offset,
            count=True,
        )
    except AdminStoreError as exc:
        raise HTTPException(
            status_code=404,
            detail="No crop table is installed. The crop advisory uses rule-based guidance today.",
        ) from exc
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/curated/{table}", response_model=Page)
async def curated(
    table: str,
    pagination: Annotated[Pagination, Depends()],
    admin: AdminActor = Depends(require_permission("agri_data.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    """Platform-owned reference tables (categories, seasons, stages, task templates)."""
    if table not in CURATED_TABLES:
        raise HTTPException(status_code=404, detail="Unknown reference table.")
    try:
        rows, total = await store.select(
            table,
            order="created_at.desc",
            limit=pagination.page_size,
            offset=pagination.offset,
            count=True,
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=404, detail="That reference table is not installed.") from exc
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)
