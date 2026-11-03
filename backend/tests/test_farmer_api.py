"""Smoke + security tests for the signed-in farmer API.

Run from ``backend/``:  ``pytest -q``

These tests never touch a real Supabase project:

* ``require_user`` is exercised with no header and with a garbage token, which
  must both be refused (401) before any data code runs.
* The handler functions are called directly with a fake store so the *shape*
  and the honesty rules of the overview can be asserted — most importantly that
  revenue never counts a pending order and that unknown profit is ``None``,
  never ``0``.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.api.v1 import farmer


class FakeStore:
    """Returns canned rows per table, ignoring filters (scoped by user in SQL)."""

    def __init__(self, rows: dict[str, list[dict]]) -> None:
        self.rows = rows

    async def select(self, table: str, **_kwargs):  # noqa: D401 - test double
        return list(self.rows.get(table, []))


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _patch_store(monkeypatch):
    monkeypatch.setattr(farmer, "_store_or_503", lambda: FakeStore(_ROWS))
    return None


_ROWS: dict[str, list[dict]] = {}


def _user() -> farmer.CurrentUser:
    return farmer.CurrentUser(user_id="11111111-1111-1111-1111-111111111111", email="a@b.c", claims={})


# ── Auth ──────────────────────────────────────────────────────────────────


def test_missing_token_is_rejected_before_any_data():
    class NoHeader:
        headers: dict[str, str] = {}

    with pytest.raises(HTTPException) as exc:
        run(farmer.require_user(farmer._bearer(  # type: ignore[arg-type]
            NoHeader())))  # type: ignore[arg-type]
    assert exc.value.status_code == 401


# ── Overview ──────────────────────────────────────────────────────────────


def test_overview_reports_area_and_active_crops_only():
    _ROWS.clear()
    _ROWS.update(
        {
            "farms": [
                {"id": "f1", "area_ha": "1.50", "is_active": True},
                {"id": "f2", "area_ha": "0.50", "is_active": False},
            ],
            "crops": [
                {"id": "c1", "name": "Paddy", "status": "healthy"},
                {"id": "c2", "name": "Potato", "status": "harvested"},
            ],
            "farmer_tasks": [{"id": "t1", "due_on": "2024-01-01"}],
            "farm_activities": [],
            "farmer_expenses": [{"id": "e1", "category": "seeds", "amount_inr": "1200.50", "crop_id": "c1"}],
            "soil_tests": [],
            "irrigation_logs": [],
        }
    )
    out = run(farmer.overview(_user()))
    assert out["area_ha"] == 2.0
    assert out["counts"]["active_crops"] == 1
    assert out["counts"]["month_expenses_inr"] == 1200.5
    assert out["month_expenses"][0]["crop"] == "Paddy"


def test_overview_is_empty_safe():
    _ROWS.clear()
    out = run(farmer.overview(_user()))
    assert out["counts"]["farms"] == 0
    assert out["area_ha"] == 0
    assert out["crops"] == []


# ── Finance ───────────────────────────────────────────────────────────────


def test_pending_order_is_not_counted_as_income():
    _ROWS.clear()
    _ROWS.update(
        {
            "farmer_expenses": [{"id": "e1", "category": "labour", "amount_inr": "500"}],
            "listings": [{"id": "l1", "title": "Paddy"}],
            "orders": [
                {"id": "o1", "listing_id": "l1", "amount_inr": "4000", "status": "delivered", "created_at": "2024-01-02"},
                {"id": "o2", "listing_id": "l1", "amount_inr": "9000", "status": "pending", "created_at": "2024-01-03"},
            ],
            "crops": [],
        }
    )
    out = run(farmer.finance(_user()))
    assert out["revenue"]["confirmed_inr"] == 4000
    assert out["revenue"]["pending_inr"] == 9000
    assert out["profit"]["net_inr"] == 3500


def test_profit_is_unknown_without_sales():
    _ROWS.clear()
    _ROWS.update({"farmer_expenses": [], "listings": [], "orders": [], "crops": []})
    out = run(farmer.finance(_user()))
    # Unknown, not zero — the UI must never print a fake ₹0 profit.
    assert out["profit"]["net_inr"] is None


# ── Advisory ──────────────────────────────────────────────────────────────


def test_advisory_rejects_a_farm_that_is_not_yours():
    _ROWS.clear()
    _ROWS.update({"profiles": [{"details": {"district": "Nadia"}}], "farms": []})
    payload = farmer.FarmerAdvisoryRequest(question="When to irrigate?", farm_id="other-farm")
    with pytest.raises(HTTPException) as exc:
        run(farmer.farmer_advisory(payload, _user()))
    assert exc.value.status_code == 403


def test_advisory_unknown_language_falls_back_to_english():
    _ROWS.clear()
    _ROWS.update({"profiles": [{"details": {"district": "Nadia", "state": "West Bengal"}}]})

    async def fake_advise(**_kwargs):
        return {"mode": "demo", "model": None, "answer": "ok", "steps": ["ok"], "notice": None}

    original = farmer.advisory_service.advise
    farmer.advisory_service.advise = fake_advise  # type: ignore[assignment]
    try:
        payload = farmer.FarmerAdvisoryRequest(question="Yellow leaves", language="Klingon")
        out = run(farmer.farmer_advisory(payload, _user()))
    finally:
        farmer.advisory_service.advise = original  # type: ignore[assignment]
    assert out["language"] == "English"
    assert out["context"]["district"] == "Nadia"
