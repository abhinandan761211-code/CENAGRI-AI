"""Role & permission management.

Permissions are rows, not code. Editing a mapping here changes what the API
allows on the very next request, because ``app.core.security`` reads the same
tables. Two guardrails:

* ``super_admin`` always holds every permission and its mapping is not editable
  — a bad PATCH can never lock the platform out of its own admin panel.
* Every change clears the permission cache and writes an audit row.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.security import (
    AdminActor,
    audit,
    clear_admin_cache,
    permission_matrix,
    require_permission,
)
from app.db.admin_store import AdminStore
from app.db.session import get_admin_db
from app.schemas.admin import RoleAssignment, RolePermissionUpdate

router = APIRouter()


class PermissionCreate(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$", max_length=60)
    module: str = Field(min_length=2, max_length=40)
    label: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    sensitive: bool = False


@router.get("")
async def get_matrix(
    admin: AdminActor = Depends(require_permission("roles.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    roles = await store.all_pages("admin_roles", columns="key,label,description,is_system,sort_order")
    permissions = await store.all_pages(
        "admin_permissions", columns="key,module,label,description,sensitive,sort_order"
    )
    mapping = await store.all_pages("admin_role_permissions", columns="role_key,permission_key")
    matrix = permission_matrix(roles, permissions, mapping)
    matrix["roles"].sort(key=lambda r: r.get("sort_order", 0))
    matrix["permissions"].sort(key=lambda p: p.get("sort_order", 0))
    return matrix


@router.get("/admins")
async def list_admins(
    admin: AdminActor = Depends(require_permission("roles.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    rows = await store.all_pages(
        "admin_users",
        columns="user_id,role_key,is_active,extra_permissions,mfa_required,mfa_enrolled_at,notes,created_at",
    )
    role_labels = {
        r["key"]: r.get("label") for r in await store.all_pages("admin_roles", columns="key,label")
    }
    # Attach the person, not just the id — read profiles in one query.
    ids = [r["user_id"] for r in rows if r.get("user_id")]
    profiles: list[dict[str, Any]] = []
    if ids:
        profiles = await store.select(
            "profiles",
            columns="id,full_name,email,avatar_url",
            filters={"id": f"in.({','.join(ids)})"},
        )
    by_id = {p["id"]: p for p in profiles}
    for row in rows:
        row["role_label"] = role_labels.get(row.get("role_key"))
        row["profile"] = by_id.get(row.get("user_id"))
    return {"rows": rows}


@router.put("/admins/{user_id}")
async def assign_role(
    user_id: str,
    payload: RoleAssignment,
    request: Request,
    admin: AdminActor = Depends(require_permission("roles.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Grant, change or revoke an admin role. Super Admin only."""
    if admin.role_key != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Only a Super Admin can change admin roles.",
        )
    if user_id == admin.user_id and not payload.is_active:
        raise HTTPException(status_code=422, detail="You cannot disable your own admin access.")

    roles = await store.select("admin_roles", columns="key", filters={"key": f"eq.{payload.role_key}"})
    if not roles:
        raise HTTPException(status_code=422, detail="Unknown admin role.")

    known = await store.all_pages("admin_permissions", columns="key")
    known_keys = {p["key"] for p in known}
    unknown = [p for p in payload.extra_permissions if p not in known_keys]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown permission: {', '.join(unknown[:3])}")

    profiles = await store.select("profiles", columns="id,email", filters={"id": f"eq.{user_id}"})
    if not profiles:
        raise HTTPException(status_code=404, detail="That account does not exist.")

    before = await store.select(
        "admin_users", columns="role_key,is_active,extra_permissions", filters={"user_id": f"eq.{user_id}"}
    )
    now = datetime.now(tz=timezone.utc).isoformat()
    values = {
        "user_id": user_id,
        "role_key": payload.role_key,
        "is_active": payload.is_active,
        "extra_permissions": payload.extra_permissions,
        "created_by": admin.user_id,
        "updated_at": now,
    }
    if before:
        updated = await store.update("admin_users", values, filters={"user_id": f"eq.{user_id}"})
    else:
        updated = await store.insert("admin_users", values)

    clear_admin_cache()
    await audit(
        store,
        request,
        admin,
        action="roles.assign",
        module="roles",
        target_type="admin_user",
        target_id=user_id,
        reason=payload.reason,
        before=before[0] if before else None,
        after={"role_key": payload.role_key, "is_active": payload.is_active},
    )
    return {"ok": True, "admin": updated[0] if updated else None}


@router.patch("/{role_key}/permissions")
async def set_role_permissions(
    role_key: str,
    payload: RolePermissionUpdate,
    request: Request,
    admin: AdminActor = Depends(require_permission("roles.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Replace a role's permission set."""
    if admin.role_key != "super_admin":
        raise HTTPException(status_code=403, detail="Only a Super Admin can edit permissions.")
    if role_key == "super_admin":
        raise HTTPException(
            status_code=422,
            detail="Super Admin always holds every permission; this mapping cannot be edited.",
        )

    role = await store.select("admin_roles", columns="key", filters={"key": f"eq.{role_key}"})
    if not role:
        raise HTTPException(status_code=404, detail="Unknown admin role.")

    known = {p["key"] for p in await store.all_pages("admin_permissions", columns="key")}
    unknown = [k for k in payload.permission_keys if k not in known]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown permission: {', '.join(unknown[:3])}")

    before = sorted(
        r["permission_key"]
        for r in await store.all_pages(
            "admin_role_permissions", columns="permission_key", filters={"role_key": f"eq.{role_key}"}
        )
    )

    # Replace in two steps: drop the mapping, then insert the new one. The
    # primary key is (role_key, permission_key), so this is exact.
    await store.delete("admin_role_permissions", filters={"role_key": f"eq.{role_key}"})

    if payload.permission_keys:
        await store.insert(
            "admin_role_permissions",
            [{"role_key": role_key, "permission_key": key} for key in payload.permission_keys],
            returning=False,
        )

    clear_admin_cache()
    await audit(
        store,
        request,
        admin,
        action="roles.permissions.update",
        module="roles",
        target_type="admin_role",
        target_id=role_key,
        reason=payload.reason,
        before={"permissions": before},
        after={"permissions": sorted(payload.permission_keys)},
    )
    return {"ok": True, "role": role_key, "permissions": sorted(payload.permission_keys)}


@router.post("/permissions")
async def create_permission(
    payload: Annotated[PermissionCreate, Body()],
    request: Request,
    admin: AdminActor = Depends(require_permission("roles.manage")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Add a permission. A Super Admin grants it to roles afterwards."""
    if admin.role_key != "super_admin":
        raise HTTPException(status_code=403, detail="Only a Super Admin can add permissions.")
    try:
        created = await store.insert("admin_permissions", payload.model_dump())
    except Exception as exc:  # noqa: BLE001 — duplicate key surfaces as PGRST error
        raise HTTPException(status_code=409, detail="That permission already exists.") from exc
    await audit(
        store,
        request,
        admin,
        action="roles.permissions.create",
        module="roles",
        target_type="admin_permission",
        target_id=payload.key,
        reason="New permission definition",
        after=payload.model_dump(),
    )
    return {"ok": True, "permission": created[0] if created else None}


@router.get("/me")
async def whoami(admin: AdminActor = Depends(require_permission("dashboard.view"))) -> dict[str, Any]:
    """The signed-in admin: role plus the exact permission list the UI filters on."""
    return {
        "user_id": admin.user_id,
        "email": admin.email,
        "role_key": admin.role_key,
        "role_label": admin.role_label,
        "permissions": sorted(admin.permissions),
        "mfa": admin.aal,
    }
