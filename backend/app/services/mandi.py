"""Live mandi (agricultural market) prices from data.gov.in.

Source dataset: "Current Daily Price of Various Commodities from Various Markets
(Mandi)" — Ministry of Agriculture and Farmers Welfare, published on data.gov.in
and refreshed every day.

The API key stays on the server: this module is the only place that talks to
data.gov.in, and the router in ``app.api.v1.mandi`` re-exposes the data at
``/api/v1/mandi``. Responses are cached in-process for a few minutes because the
upstream dataset only changes once a day and its rate limit is per key.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

RESOURCE_URL = (
    "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
)

# Upstream limits a page to 10 records unless asked for more; 500 keeps a
# district-sized query inside a single request.
MAX_LIMIT = 500
CACHE_TTL_SECONDS = 900  # 15 minutes


class MandiError(RuntimeError):
    """Raised when the upstream mandi feed cannot be read."""


@dataclass
class _CacheEntry:
    expires_at: float
    payload: dict[str, Any]


_cache: dict[str, _CacheEntry] = {}

# One shared client: keep-alive across requests, no connection storm upstream.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        # data.gov.in sits behind a Tyk gateway that silently drops requests
        # whose User-Agent starts with "python-" (httpx's default), so the
        # request would hang until the read timeout. Identify ourselves.
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0),
            headers={"User-Agent": "CenAGRI-AI/0.1 (+https://cenagri.ai)"},
        )
    return _client


async def close_client() -> None:
    """Release the shared HTTP client on application shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def is_configured() -> bool:
    return bool(settings.DATA_GOV_API_KEY.strip())


def _cache_key(**params: Any) -> str:
    return "|".join(f"{k}={params[k]}" for k in sorted(params))


def clear_cache() -> None:
    _cache.clear()


def _num(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split())


def _normalise(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "state": _clean(record.get("state")),
        "district": _clean(record.get("district")),
        "market": _clean(record.get("market")),
        "commodity": _clean(record.get("commodity")),
        "variety": _clean(record.get("variety")),
        "grade": _clean(record.get("grade")),
        "arrival_date": _clean(record.get("arrival_date")),
        "min_price": _num(record.get("min_price")),
        "max_price": _num(record.get("max_price")),
        "modal_price": _num(record.get("modal_price")),
    }


async def fetch_prices(
    *,
    state: str | None = None,
    district: str | None = None,
    market: str | None = None,
    commodity: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Return mandi price records, cached for ``CACHE_TTL_SECONDS``.

    Filters are exact-match on the dataset's keyword fields, which is what the
    frontend needs (a farmer's state / district). Results are sorted by modal
    price, highest first, so the most valuable trades are on page one.
    """
    if not is_configured():
        raise MandiError(
            "Mandi feed is not configured. Set DATA_GOV_API_KEY in the backend .env."
        )

    limit = max(1, min(int(limit), MAX_LIMIT))
    offset = max(0, int(offset))

    params: dict[str, Any] = {
        "state": (state or "").strip(),
        "district": (district or "").strip(),
        "market": (market or "").strip(),
        "commodity": (commodity or "").strip(),
        "limit": limit,
        "offset": offset,
    }

    key = _cache_key(**params)
    cached = _cache.get(key)
    now = time.monotonic()
    if cached and cached.expires_at > now:
        return {**cached.payload, "cached": True}

    query: dict[str, Any] = {
        "api-key": settings.DATA_GOV_API_KEY.strip(),
        "format": "json",
        "limit": limit,
        "offset": offset,
        "sort[modal_price]": "desc",
    }
    if params["state"]:
        query["filters[state.keyword]"] = params["state"]
    if params["district"]:
        query["filters[district.keyword]"] = params["district"]
    if params["market"]:
        query["filters[market.keyword]"] = params["market"]
    if params["commodity"]:
        query["filters[commodity.keyword]"] = params["commodity"]

    try:
        res = await _get_client().get(RESOURCE_URL, params=query)
    except httpx.HTTPError as exc:  # network error, timeout, DNS...
        raise MandiError(f"Could not reach the mandi price service: {exc}") from exc

    try:
        body = res.json()
    except ValueError as exc:
        raise MandiError("Mandi price service returned an unreadable response.") from exc

    # Errors are `{"error": "Key not authorised"}` (403) or a nested Elasticsearch
    # error under `message`, both with an HTTP 200 body. `message` is ALSO
    # "Resource lists" on every successful response, so only `error` — or a body
    # without records — means failure.
    if res.status_code == 429:
        raise MandiError("The mandi price service is rate-limiting us. Try again shortly.")

    upstream_error = body.get("error")
    if not upstream_error and not body.get("records") and "records" not in body:
        if isinstance(body.get("message"), str) and body["message"].strip():
            upstream_error = body["message"]

    if upstream_error or body.get("status") != "ok" or res.status_code != 200:
        reason = upstream_error if isinstance(upstream_error, str) else ""
        if not reason.strip():
            reason = f"HTTP {res.status_code}"
        raise MandiError(f"Mandi price service rejected the request: {reason.strip()}")

    records = [_normalise(r) for r in body.get("records") or []]
    # Some rows come back without a modal price; keep the list useful.
    records = [r for r in records if r["commodity"]]
    records.sort(key=lambda r: r["modal_price"] or 0, reverse=True)

    payload = {
        "source": "data.gov.in — Current Daily Price of Various Commodities from Various Markets (Mandi)",
        # The dataset reports its total as a string, and sometimes omits it.
        "total": int(_num(body.get("total")) or len(records)),
        "count": len(records),
        "limit": limit,
        "offset": offset,
        "cached": False,
        "records": records,
    }

    _cache[key] = _CacheEntry(expires_at=now + CACHE_TTL_SECONDS, payload=payload)

    # Bound memory: drop expired entries on every miss.
    if len(_cache) > 256:
        for stale in [k for k, v in _cache.items() if v.expires_at <= now]:
            _cache.pop(stale, None)

    return payload


async def warm_cache() -> None:
    """Best-effort prefetch so the first farmer dashboard load is instant."""
    if not is_configured():
        return
    try:
        await fetch_prices(limit=10)
    except (MandiError, asyncio.CancelledError):
        # Startup must never fail because an upstream feed is down.
        pass
