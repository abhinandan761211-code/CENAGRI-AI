"""Mandi price endpoints — live feed proxied from data.gov.in.

Keeps the API key on the server and normalises the dataset into JSON the
dashboard can render directly. See ``app.services.mandi`` for caching details.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.services import mandi as mandi_service

router = APIRouter()


@router.get("")
async def list_prices(
    state: Annotated[str | None, Query(description="Exact state name, e.g. West Bengal")] = None,
    district: Annotated[str | None, Query(description="Exact district name, e.g. Nadia")] = None,
    market: Annotated[str | None, Query(description="Exact market (APMC) name")] = None,
    commodity: Annotated[str | None, Query(description="Exact commodity name, e.g. Tomato")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Records per page")] = 100,
    offset: Annotated[int, Query(ge=0, description="Records to skip")] = 0,
) -> dict:
    """Today's mandi prices, highest modal price first."""
    try:
        return await mandi_service.fetch_prices(
            state=state,
            district=district,
            market=market,
            commodity=commodity,
            limit=limit,
            offset=offset,
        )
    except mandi_service.MandiError as exc:
        message = str(exc)
        # Misconfiguration is a server bug; a flaky upstream is a 502.
        status = 503 if "not configured" in message else 502
        raise HTTPException(status_code=status, detail=message) from exc


@router.get("/status")
def status() -> dict:
    """Whether the mandi feed is configured, without calling upstream."""
    return {
        "configured": mandi_service.is_configured(),
        "source": "data.gov.in",
        "dataset": "Current Daily Price of Various Commodities from Various Markets (Mandi)",
    }
