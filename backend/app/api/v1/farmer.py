"""Signed-in farmer endpoints.

Why this module exists
----------------------
A few farmer features must not be computed in the browser:

* the **overview** mixes farms, crops, tasks, alerts and money, and a wrong or
  forged figure here becomes a business decision. It is assembled server-side.
* the **AI advisory** must receive *only* authorised context (role, crop, stage,
  location, language, weather) and never the browser's whole profile blob.

Everything else (CRUD on the farmer's own rows) keeps using Supabase directly,
where Row Level Security already scopes every table to ``auth.uid()``. This
module therefore *reads for display* and *verifies identity*, and it never
trusts a user id, role or farm id sent by the client.

Auth
----
Every route depends on :func:`require_user`, which verifies the Supabase access
token (JWKS for RS256/ES256 projects, the legacy HS256 secret otherwise) and
returns the verified id. No token → 401. That is the same verification the admin
panel uses in ``app.core.security``.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Any

import httpx  # noqa: F401 — re-exported so tests can patch upstream calls
from fastapi import APIRouter, Depends, HTTPException, Request, status  # noqa: F401
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import _bearer, _decode_token, _fetch_jwks
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db  # noqa: F401 — kept for dependency overrides
from app.services import advisory as advisory_service

router = APIRouter()


# ── Verified user ─────────────────────────────────────────────────────────


class CurrentUser:
    """The verified caller. Built from the JWT only — never from the body."""

    def __init__(self, user_id: str, email: str, claims: dict[str, Any]) -> None:
        self.user_id = user_id
        self.email = email
        self.claims = claims


async def require_user(token: str = Depends(_bearer)) -> CurrentUser:
    """Verify the Supabase session and return the caller's verified id."""
    jwks = await _fetch_jwks()
    claims = _decode_token(token, jwks)
    user_id = str(claims.get("sub") or "")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is missing a user id. Sign in again.",
        )
    return CurrentUser(user_id=user_id, email=str(claims.get("email") or ""), claims=claims)


def _store_or_503() -> AdminStore:
    """PostgREST access with the service role; 503 when the server has no key.

    The service role is used *only* after the caller is verified above, and every
    query below filters on the verified ``user_id``. No route accepts a user id
    as input.
    """
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The server is missing Supabase credentials, so this data cannot be read.",
        )
    return AdminStore.from_settings(settings)


async def _select(store: AdminStore, table: str, **kwargs: Any) -> list[dict[str, Any]]:
    """Select that turns a missing table into an empty list instead of a 500.

    A fresh install that has not run ``farmer.sql`` yet should render the
    screen's empty state, not an error page.
    """
    try:
        rows = await store.select(table, **kwargs)
    except AdminStoreError as exc:
        message = str(exc).lower()
        if "does not exist" in message or "schema cache" in message or "relation" in message:
            return []
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return rows if isinstance(rows, list) else []


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _iso_today() -> str:
    return date.today().isoformat()


def _month_start() -> str:
    today = date.today()
    return today.replace(day=1).isoformat()


# ── Overview ──────────────────────────────────────────────────────────────


@router.get("/overview")
async def overview(
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """Everything the farmer dashboard shows, from the caller's own rows only.

    Each block reports how many rows it found, so the UI can say "not recorded
    yet" instead of drawing a zero that looks like a measurement.
    """
    store = _store_or_503()
    me = {"owner_id": f"eq.{user.user_id}"}
    today = _iso_today()

    farms, crops, tasks, activities, expenses, soil, irrigation = (
        await _select(store, "farms", columns="*", filters=me, order="created_at.desc"),
        await _select(store, "crops", columns="*", filters=me, order="planted_on.desc"),
        await _select(
            store,
            "farmer_tasks",
            columns="*",
            filters={**me, "done": "eq.false", "due_on": f"lte.{today}"},
            order="due_on.asc",
            limit=20,
        ),
        await _select(
            store,
            "farm_activities",
            columns="id,kind,title,activity_on,cost_inr,crop_id,farm_id",
            filters=me,
            order="activity_on.desc",
            limit=8,
        ),
        await _select(
            store,
            "farmer_expenses",
            columns="id,category,amount_inr,spent_on,crop_id",
            filters={**me, "spent_on": f"gte.{_month_start()}"},
            order="spent_on.desc",
            limit=500,
        ),
        await _select(
            store,
            "soil_tests",
            columns="id,farm_id,tested_on,ph,soil_category",
            filters=me,
            order="tested_on.desc",
            limit=1,
        ),
        await _select(
            store,
            "irrigation_logs",
            columns="id,irrigated_on,crop_id",
            filters=me,
            order="irrigated_on.desc",
            limit=1,
        ),
    )

    # Crops that are still on the land (harvested rows are history).
    active_crops = [c for c in crops if (c.get("status") or "healthy") != "harvested"]
    area_ha = sum(_num(f.get("area_ha")) for f in farms)
    spends = sum(_num(e.get("amount_inr")) for e in expenses)

    by_crop: dict[str, float] = {}
    for row in expenses:
        crop_id = row.get("crop_id")
        key = str(crop_id) if crop_id else "unassigned"
        by_crop[key] = by_crop.get(key, 0.0) + _num(row.get("amount_inr"))

    crop_names = {c["id"]: c.get("name") for c in crops}
    per_crop = [
        {"crop_id": cid, "crop": crop_names.get(cid) or "Unassigned", "spent_inr": round(value, 2)}
        for cid, value in sorted(by_crop.items(), key=lambda kv: kv[1], reverse=True)
    ]

    return {
        "counts": {
            "farms": len(farms),
            "active_farms": sum(1 for f in farms if f.get("is_active") is not False),
            "active_crops": len(active_crops),
            "tasks_today": len(tasks),
            "month_expenses_inr": round(spends, 2),
            "month_expense_rows": len(expenses),
        },
        "area_ha": round(area_ha, 2),
        "crops": active_crops[:8],
        "farms": farms[:6],
        "tasks": tasks[:10],
        "recent_activities": activities,
        "month_expenses": per_crop,
        "latest_soil_test": soil[0] if soil else None,
        "last_irrigation": irrigation[0] if irrigation else None,
        "server_date": today,
    }


# ── Expenses & profit ─────────────────────────────────────────────────────


@router.get("/finance")
async def finance(
    user: Annotated[CurrentUser, Depends(require_user)],
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Expenses by category and crop, revenue from **delivered** sales only.

    Important: revenue counts only orders whose status is ``delivered``. An
    order that is merely placed is not income, so it is reported separately as
    ``pending_inr`` and never added to profit.
    """
    store = _store_or_503()
    start = date_from or "1970-01-01"
    end = date_to or _iso_today()

    expenses = await _select(
        store,
        "farmer_expenses",
        columns="*",
        filters={"owner_id": f"eq.{user.user_id}", "spent_on": f"gte.{start}"},
        order="spent_on.desc",
        limit=2000,
    )
    expenses = [e for e in expenses if (e.get("spent_on") or "") <= end]

    # Sales: orders on my listings. Delivered = confirmed income.
    listings = await _select(
        store, "listings", columns="id,title", filters={"seller_id": f"eq.{user.user_id}"}
    )
    listing_title = {l["id"]: l.get("title") for l in listings}
    orders = []
    if listing_title:
        ids = ",".join(f'"{i}"' for i in listing_title)
        orders = await _select(
            store,
            "orders",
            columns="id,listing_id,quantity_kg,amount_inr,status,created_at",
            filters={"listing_id": f"in.({ids})"},
            order="created_at.desc",
            limit=2000,
        )
        orders = [o for o in orders if (o.get("created_at") or "")[:10] <= end]

    delivered = [o for o in orders if o.get("status") == "delivered"]
    pending = [o for o in orders if o.get("status") in {"pending", "confirmed"}]

    crops = await _select(store, "crops", columns="id,name", filters={"owner_id": f"eq.{user.user_id}"})
    crop_name = {c["id"]: c.get("name") for c in crops}

    categories: dict[str, float] = {}
    per_crop: dict[str, float] = {}
    for e in expenses:
        cat = e.get("category") or "other"
        categories[cat] = categories.get(cat, 0.0) + _num(e.get("amount_inr"))
        cid = e.get("crop_id")
        if cid:
            key = crop_name.get(cid) or "Removed crop"
            per_crop[key] = per_crop.get(key, 0.0) + _num(e.get("amount_inr"))

    total_spent = sum(categories.values())
    earned = sum(_num(o.get("amount_inr")) for o in delivered)

    return {
        "range": {"from": start, "to": end},
        "expenses": {
            "rows": expenses[:200],
            "total_inr": round(total_spent, 2),
            "by_category": [
                {"category": k, "amount_inr": round(v, 2)}
                for k, v in sorted(categories.items(), key=lambda kv: kv[1], reverse=True)
            ],
            "by_crop": [
                {"crop": k, "amount_inr": round(v, 2)}
                for k, v in sorted(per_crop.items(), key=lambda kv: kv[1], reverse=True)
            ],
        },
        "revenue": {
            "confirmed_inr": round(earned, 2),
            "pending_inr": round(sum(_num(o.get("amount_inr")) for o in pending), 2),
            "confirmed_orders": len(delivered),
            "pending_orders": len(pending),
            "note": "Only delivered orders are counted as income. Pending orders are shown separately.",
        },
        "profit": {
            # None (not 0) when nothing has been sold yet — that is "unknown",
            # not a loss, and the UI prints it that way.
            "net_inr": round(earned - total_spent, 2) if earned or total_spent else None,
            "basis": "delivered sales minus recorded expenses",
        },
    }


# ── AI advisory with authorised context ───────────────────────────────────


class FarmerAdvisoryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    crop: str | None = Field(default=None, max_length=80)
    crop_stage: str | None = Field(default=None, max_length=60)
    soil: str | None = Field(default=None, max_length=200)
    weather: str | None = Field(default=None, max_length=160)
    language: str = Field(default="English", max_length=40)
    farm_id: str | None = Field(default=None, max_length=64)


# Language names the model understands; anything else falls back to English.
ALLOWED_LANGUAGES = {"English", "Hindi", "Bengali", "Odia", "Assamese", "Tamil", "Telugu"}


@router.post("/advisory")
async def farmer_advisory(
    payload: FarmerAdvisoryRequest,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """Advisory with only the caller's own, verified context.

    The browser may suggest a farm; the **server** checks it belongs to the
    caller before any of its details are used. Location comes from the
    caller's own profile row, not from the request body.
    """
    store = _store_or_503()
    profile = await _select(
        store, "profiles", columns="details", filters={"id": f"eq.{user.user_id}"}, limit=1
    )
    details = (profile[0].get("details") if profile else {}) or {}

    soil: str | None = payload.soil
    if payload.farm_id:
        farms = await _select(
            store,
            "farms",
            columns="id,name,soil_type,irrigation,crops",
            filters={"id": f"eq.{payload.farm_id}", "owner_id": f"eq.{user.user_id}"},
            limit=1,
        )
        if not farms:
            raise HTTPException(status_code=403, detail="That farm is not on your account.")
        farm = farms[0]
        parts = [p for p in (farm.get("soil_type"), farm.get("irrigation")) if p]
        if parts:
            soil = soil or " · ".join(parts)

    language = payload.language if payload.language in ALLOWED_LANGUAGES else "English"

    # Compose a compact, authorised context line for the model.
    context_bits = []
    if payload.crop:
        context_bits.append(f"crop {payload.crop}" + (f" at {payload.crop_stage} stage" if payload.crop_stage else ""))
    if soil:
        context_bits.append(f"soil {soil}")
    question = payload.question
    if context_bits:
        question = f"[{' ; '.join(context_bits)}] {question}"

    try:
        answer = await advisory_service.advise(
            question=question,
            crop=payload.crop,
            district=details.get("district"),
            state=details.get("state"),
            weather=payload.weather,
            language=language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        **answer,
        "language": language,
        "context": {
            "crop": payload.crop,
            "crop_stage": payload.crop_stage,
            "soil": soil,
            "district": details.get("district"),
            "state": details.get("state"),
        },
    }


# ── AI provider reachability (used by the AI status chip) ─────────────────


@router.get("/ai-status")
async def ai_status(user: Annotated[CurrentUser, Depends(require_user)]) -> dict[str, Any]:
    """Whether a model is configured — lets the UI label demo vs. real advice."""
    _ = user  # require_user has already verified the caller
    return {
        "configured": advisory_service.is_configured(),
        "model": settings.LLM_MODEL if advisory_service.is_configured() else None,
        "checked_at": datetime.now(tz=timezone.utc).isoformat(),
    }


@router.get("/health")
async def farmer_health(user: Annotated[CurrentUser, Depends(require_user)]) -> dict[str, Any]:
    """Small authenticated ping — proves the token round-trip works."""
    return {"ok": True, "user_id": user.user_id}


__all__ = ["router", "require_user", "CurrentUser"]
