"""Health / readiness endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("")
def check() -> dict:
    return {"status": "ok"}
