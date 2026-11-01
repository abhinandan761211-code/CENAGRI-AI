"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import advisory, health, mandi

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(mandi.router, prefix="/mandi", tags=["mandi"])
api_router.include_router(advisory.router, prefix="/advisory", tags=["advisory"])
