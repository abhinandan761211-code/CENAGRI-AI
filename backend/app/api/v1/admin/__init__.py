"""The admin API, mounted at ``/api/v1/admin``.

Every router below is guarded at the *route* level by
``app.core.security.require_permission``. There is no route in here that a
verified admin without the matching permission can reach, and there is no
route at all without a verified admin session — the frontend's route guard is
convenience, not security.
"""

from fastapi import APIRouter

from app.api.v1.admin import agri, business, content, dashboard, kyc, ops, roles, system, users

router = APIRouter()

router.include_router(dashboard.router, prefix="/dashboard", tags=["admin: dashboard"])
router.include_router(users.router, prefix="/users", tags=["admin: users"])
router.include_router(roles.router, prefix="/roles", tags=["admin: roles"])
router.include_router(kyc.router, prefix="/kyc", tags=["admin: kyc"])
router.include_router(content.router, prefix="/content", tags=["admin: content"])
router.include_router(business.router, prefix="/business", tags=["admin: business"])
router.include_router(agri.router, prefix="/agri", tags=["admin: agri data"])
router.include_router(ops.router, prefix="/ops", tags=["admin: ops"])
router.include_router(system.router, prefix="/system", tags=["admin: system"])
