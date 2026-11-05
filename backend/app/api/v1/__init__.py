"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import advisory, ai, farmer, health, mandi, social
from app.api.v1.admin import router as admin_router
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(mandi.router, prefix="/mandi", tags=["mandi"])
api_router.include_router(advisory.router, prefix="/advisory", tags=["advisory"])
# Multilingual AI. Mounted like the farmer routes: the chat and translation
# endpoints both require a verified Supabase session, so without the ability to
# verify one they must not exist rather than be open to anonymous callers.
if settings.user_api_enabled:
    api_router.include_router(ai.router, prefix="/ai", tags=["ai"])

# CenFriend. Always mounted: these routes are part of the app surface, and a
# missing server dependency must not turn the whole namespace into a 404 —
# that reads as "this feature does not exist" in the browser console and hides
# the real problem. Each route verifies the caller's Supabase session itself and
# answers 401 when it cannot, then 503 when the server lacks data credentials.
api_router.include_router(social.router, prefix="/social", tags=["social"])

# Signed-in farmer reads. Mounted only when the server can verify a Supabase
# token and read the farmer's own rows with the service role; without that the
# routes would be unauthenticated, so they simply do not exist.
if settings.user_api_enabled:
    api_router.include_router(farmer.router, prefix="/farmer", tags=["farmer"])

# The admin panel is only mounted when the server holds the credentials it needs
# to verify sessions and read locked-down tables. Without them the routes do not
# exist at all, which is safer than a route that returns 500.
if settings.admin_enabled:
    api_router.include_router(admin_router, prefix="/admin")
