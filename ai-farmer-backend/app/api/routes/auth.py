from fastapi import APIRouter, HTTPException, Body, Query, Header
from app.schemas.user import UserCreate, UserResponse, UserLogin
from app.utils.auth import get_password_hash, verify_password, create_access_token, decode_access_token
from app.services.supabase_db import get_supabase_db
from app.services.supabase_state_store import get_dashboard_state_store
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import random

router = APIRouter()

FORGOT_PASSWORD_OTP_TTL_SECONDS = 10 * 60
FORGOT_PASSWORD_OTP_STORE = {}

DEMO_ACCOUNTS = {
    "demo.farmer@cenagri.ai": {
        "name": "Demo Farmer",
        "password": "Demo@12345",
        "phone": "9999999999",
        "user_type": "farmer",
        "location": "Supaul, Bihar",
    },
}

SUPPORTED_NETWORK_ROLES = {
    "farmer",
    "seller",
    "buyer",
    "local_buyer",
    "worker",
    "equipment_owner",
    "transporter",
    "store",
    "admin",
}

NETWORK_ROLE_ORDER = [
    "admin",
    "farmer",
    "buyer",
    "local_buyer",
    "worker",
    "equipment_owner",
    "transporter",
    "store",
]

SOCIAL_HUB_SCOPE_PREFIX = "cenfriend_social_hub_v1"


def _social_hub_scope(user_id: Any) -> str:
    return f"{SOCIAL_HUB_SCOPE_PREFIX}:{_normalize_id(user_id) or 'guest'}"


def _social_hub_default_state() -> Dict[str, Any]:
    return {
        "videos": [],
        "stories": [],
        "feed_posts": [],
        "dm_threads": {},
        "video_stats": {},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _sanitize_social_hub_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    safe = _social_hub_default_state()
    if not isinstance(payload, dict):
        return safe

    if isinstance(payload.get("videos"), list):
        safe["videos"] = payload.get("videos")[:200]
    if isinstance(payload.get("stories"), list):
        safe["stories"] = payload.get("stories")[:200]
    if isinstance(payload.get("feed_posts"), list):
        safe["feed_posts"] = payload.get("feed_posts")[:300]
    if isinstance(payload.get("dm_threads"), dict):
        safe["dm_threads"] = payload.get("dm_threads")
    if isinstance(payload.get("video_stats"), dict):
        safe["video_stats"] = payload.get("video_stats")

    safe["updated_at"] = datetime.now(timezone.utc).isoformat()
    return safe


def _row_to_response(row: dict) -> UserResponse:
    return UserResponse(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        phone=str(row.get("phone") or ""),
        user_type=row["user_type"],
        business_name=row.get("business_name"),
        location=row.get("location"),
        gst_number=row.get("gst_number"),
        vehicle_type=row.get("vehicle_type"),
        license_number=row.get("license_number"),
        store_type=row.get("store_type"),
        farm_size=row.get("farm_size"),
        is_active=row.get("is_active", True),
        created_at=str(row.get("created_at", "")),
    )


def _response_to_dict(response: UserResponse) -> dict:
    if hasattr(response, "model_dump"):
        return response.model_dump()
    return response.dict()


def _require_admin_user(authorization: Optional[str]) -> dict:
    auth = str(authorization or "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    role = str(payload.get("role") or "").strip().lower()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return payload


def _require_authenticated_user(authorization: Optional[str]) -> dict:
    auth = str(authorization or "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    subject = str(payload.get("sub") or "").strip()
    email = subject.lower()
    token_user_id = payload.get("user_id") or payload.get("id")

    if not email and token_user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = get_supabase_db()
    user = None

    # Primary lookup: modern tokens where sub=email
    if email:
        user = db.get_user_by_email(email)

    # Backward compatibility: older tokens may carry numeric subject/user_id
    if not user:
        numeric_id = None
        if isinstance(token_user_id, int):
            numeric_id = token_user_id
        elif str(token_user_id or "").strip().isdigit():
            numeric_id = int(str(token_user_id).strip())
        elif subject.isdigit():
            numeric_id = int(subject)

        if numeric_id is not None:
            try:
                user = db.get_user_by_id(numeric_id)
            except Exception:
                user = None

    if not user:
        raise HTTPException(status_code=401, detail="User not found for token")

    return user


def _normalize_network_role(role: str) -> str:
    normalized = str(role or "").strip().lower()
    return "farmer" if normalized == "seller" else normalized


def _safe_user_preview(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "email": row.get("email"),
        "phone": row.get("phone"),
        "role": _normalize_network_role(row.get("user_type", "farmer")),
        "location": row.get("location"),
        "business_name": row.get("business_name"),
        "is_active": bool(row.get("is_active", True)),
    }


def _recommended_roles_for(role: str) -> List[str]:
    normalized = _normalize_network_role(role)
    mapping = {
        "farmer": ["buyer", "local_buyer", "worker", "equipment_owner", "transporter", "store"],
        "buyer": ["farmer", "store", "transporter"],
        "local_buyer": ["farmer", "store", "transporter"],
        "worker": ["farmer", "store"],
        "equipment_owner": ["farmer", "store"],
        "transporter": ["farmer", "buyer", "store", "local_buyer"],
        "store": ["farmer", "buyer", "transporter", "worker"],
        "admin": ["farmer", "buyer", "worker", "equipment_owner", "transporter", "store", "local_buyer"],
    }
    return mapping.get(normalized, ["farmer", "buyer", "worker", "transporter", "store"])


def _normalize_id(value: object) -> str:
    return str(value or "").strip()


def _users_pair_matches(row: dict, user_a_id: str, user_b_id: str) -> bool:
    requester_id = _normalize_id(row.get("requester_id"))
    target_id = _normalize_id(row.get("target_id"))
    if not requester_id or not target_id:
        return False
    return (
        requester_id == user_a_id and target_id == user_b_id
    ) or (
        requester_id == user_b_id and target_id == user_a_id
    )


def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def _is_supabase_key_error_text(value: str) -> bool:
    text = str(value or "").lower()
    return (
        "invalid api key" in text
        or "api key invalid" in text
        or ("supabase" in text and "401" in text)
    )


def _is_supabase_unavailable_text(value: str) -> bool:
    text = str(value or "").lower()
    return (
        "pgrst002" in text
        or "schema cache" in text
        or "could not query the database" in text
        or "retrying" in text and "database" in text
    )


def _is_supabase_schema_missing_text(value: str) -> bool:
    text = str(value or "").lower()
    return (
        "pgrst205" in text
        or "supabase schema missing users table" in text
        or "could not find the table 'public.users'" in text
        or "could not find the table \"public.users\"" in text
        or "table 'public.users'" in text
    )


def _generate_otp_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _try_provision_demo_user(db, normalized_email: str) -> Optional[dict]:
    demo = DEMO_ACCOUNTS.get(normalized_email)
    if not demo:
        return None

    try:
        row = db.create_user(
            {
                "name": str(demo.get("name") or "Demo User"),
                "email": normalized_email,
                "phone": str(demo.get("phone") or ""),
                "password": get_password_hash(str(demo.get("password") or "")),
                "user_type": str(demo.get("user_type") or "farmer"),
                "location": demo.get("location"),
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        try:
            db.record_user_registered(row, created_by="demo_seed")
        except Exception:
            pass
        return row
    except Exception:
        return None


@router.post("/register")
def register(user: UserCreate):
    normalized_email = _normalize_email(user.email)
    print(f"[REGISTER] Starting registration for {normalized_email}")
    print(f"[REGISTER] User type from request: {user.user_type} (type: {type(user.user_type).__name__})")
    
    db = get_supabase_db()
    
    if not db.ready:
        print(f"[REGISTER] ❌ Database not configured!")
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        # Check for duplicate email
        print(f"[REGISTER] Checking if {normalized_email} already exists...")
        existing = db.get_user_by_email(normalized_email)
        if existing:
            print(f"[REGISTER] ❌ Email already registered: {normalized_email}")
            raise HTTPException(status_code=400, detail="Email already registered")
        
        print(f"[REGISTER] Email available, hashing password...")
        hashed = get_password_hash(user.password)
        
        # Extract user_type - handle both Enum and string
        user_type_value = user.user_type.value if hasattr(user.user_type, "value") else str(user.user_type)
        print(f"[REGISTER] Extracted user_type: {user_type_value}")
        
        new_user_data = {
            "name": user.name,
            "email": normalized_email,
            "phone": user.phone,
            "password": hashed,
            "user_type": user_type_value,
            "business_name": user.business_name,
            "location": user.location,
            "gst_number": user.gst_number,
            "vehicle_type": user.vehicle_type,
            "license_number": user.license_number,
            "store_type": user.store_type,
            "farm_size": user.farm_size,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        print(f"[REGISTER] Creating user in database with user_type: {user_type_value}")
        row = db.create_user(new_user_data)
        print(f"[REGISTER] ✓ User created: {row.get('id')}, user_type from DB: {row.get('user_type')}")
        
        try:
            db.record_user_registered(row, created_by=normalized_email)
            print(f"[REGISTER] ✓ Registration logged")
        except Exception as e:
            print(f"[REGISTER] ⚠️ Failed to log registration: {e}")
            # Continue anyway - logging failure shouldn't block registration
        
        # Generate JWT token for auto-login after registration
        role = row.get("user_type", "farmer")
        print(f"[REGISTER] Role for JWT: {role}")
        token = create_access_token({"sub": row["email"], "role": role})
        
        # Build response with detailed info
        user_response = _row_to_response(row)
        print(f"[REGISTER] User response user_type: {user_response.user_type}")
        
        response_data = {
            "access_token": token,
            "token_type": "bearer",
            "role": role,  # Make sure role is in response
            "user": user_response,
        }
        print(f"[REGISTER] ✓ Returning response with role: {role}")
        return response_data
        
    except HTTPException as he:
        print(f"[REGISTER] HTTPException: {he.detail}")
        raise
    except Exception as e:
        print(f"[REGISTER] ❌ Unexpected error: {type(e).__name__}: {str(e)}")
        if _is_supabase_key_error_text(str(e)):
            raise HTTPException(
                status_code=503,
                detail="Database authentication failed. Please verify SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.",
            )
        if _is_supabase_unavailable_text(str(e)):
            raise HTTPException(
                status_code=503,
                detail="Database is not ready yet (schema cache warming). Please retry in a moment.",
            )
        if _is_supabase_schema_missing_text(str(e)):
            raise HTTPException(
                status_code=503,
                detail="Database schema is missing required tables (public.users). Run supabase_full_migration.sql on your Supabase project.",
            )
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/login")
def login(credentials: UserLogin):
    db = get_supabase_db()
    if not db.ready:
        raise HTTPException(status_code=503, detail="Database not configured")

    normalized_email = _normalize_email(credentials.email)
    try:
        users = db.get_users_by_email(normalized_email)
        if not users:
            provisioned = _try_provision_demo_user(db, normalized_email)
            users = [provisioned] if provisioned else []
    except Exception as exc:
        if _is_supabase_key_error_text(str(exc)):
            raise HTTPException(
                status_code=503,
                detail="Database authentication failed. Please verify SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.",
            )
        if _is_supabase_unavailable_text(str(exc)):
            raise HTTPException(
                status_code=503,
                detail="Database is not ready yet (schema cache warming). Please retry in a moment.",
            )
        if _is_supabase_schema_missing_text(str(exc)):
            raise HTTPException(
                status_code=503,
                detail="Database schema is missing required tables (public.users). Run supabase_full_migration.sql on your Supabase project.",
            )
        raise

    for user in users:
        stored = user.get("password", "")
        authenticated = False

        # Try hashed verification (pbkdf2_sha256)
        try:
            authenticated = verify_password(credentials.password, stored)
        except Exception:
            pass

        # Fallback: plain-text comparison (dev/migrated users) — auto-upgrade to hash
        if not authenticated and stored == credentials.password:
            authenticated = True
            try:
                new_hash = get_password_hash(credentials.password)
                db.update_user_password(user["id"], new_hash)
            except Exception:
                pass

        if authenticated:
            db.record_login_success(user.get("email") or normalized_email)
            try:
                operating_system = str(getattr(credentials, "operating_system", "") or "").strip()[:120]
                if operating_system:
                    db.update_user_admin_settings(
                        int(user["id"]),
                        {
                            "operating_system": operating_system,
                            "last_activity_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )
            except Exception:
                pass
            role = user.get("user_type", "farmer")
            token = create_access_token({"sub": user["email"], "role": role})
            return {
                "access_token": token,
                "token_type": "bearer",
                "role": role,
                "user": _row_to_response(user),
            }

    try:
        db.record_login_failure(normalized_email)
    except Exception as exc:
        if _is_supabase_key_error_text(str(exc)):
            raise HTTPException(
                status_code=503,
                detail="Database authentication failed. Please verify SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.",
            )
        if _is_supabase_unavailable_text(str(exc)):
            raise HTTPException(
                status_code=503,
                detail="Database is not ready yet (schema cache warming). Please retry in a moment.",
            )
        if _is_supabase_schema_missing_text(str(exc)):
            raise HTTPException(
                status_code=503,
                detail="Database schema is missing required tables (public.users). Run supabase_full_migration.sql on your Supabase project.",
            )
    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/change-password")
def change_password(payload: dict = Body(...)):
    user_id = payload.get("user_id")
    current_password = str(payload.get("current_password", "")).strip()
    new_password = str(payload.get("new_password", "")).strip()

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Current and new password are required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    db = get_supabase_db()
    user = db.get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(current_password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if verify_password(new_password, user.get("password", "")):
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    updated = db.update_user(int(user_id), {"password": get_password_hash(new_password)})
    if not updated:
        raise HTTPException(status_code=503, detail="Unable to update password")

    return {
        "status": "success",
        "message": "Password updated successfully",
    }


@router.post("/forgot-password")
def forgot_password(payload: dict = Body(...)):
    email = _normalize_email(payload.get("email", ""))
    otp_code = str(payload.get("otp_code", "")).strip()
    new_password = str(payload.get("new_password", "")).strip()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not otp_code:
        raise HTTPException(status_code=400, detail="OTP is required. Please request OTP first.")
    if not new_password:
        raise HTTPException(status_code=400, detail="New password is required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    otp_row = FORGOT_PASSWORD_OTP_STORE.get(email)
    if not otp_row:
        raise HTTPException(status_code=400, detail="OTP not requested or expired")

    expires_at = otp_row.get("expires_at")
    if not expires_at or datetime.now(timezone.utc) > expires_at:
        FORGOT_PASSWORD_OTP_STORE.pop(email, None)
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one")

    if otp_row.get("otp_code") != otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    db = get_supabase_db()
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored = str(user.get("password") or "")
    try:
        if stored and verify_password(new_password, stored):
            raise HTTPException(status_code=400, detail="New password must be different from current password")
    except HTTPException:
        raise
    except Exception:
        # If older records are plain text or malformed, skip same-password enforcement.
        pass

    try:
        db.update_user_password(user.get("id"), get_password_hash(new_password))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Unable to reset password: {exc}")

    FORGOT_PASSWORD_OTP_STORE.pop(email, None)

    return {
        "status": "success",
        "message": "Password reset successfully",
    }


@router.post("/forgot-password/request-otp")
def request_forgot_password_otp(payload: dict = Body(...)):
    email = _normalize_email(payload.get("email", ""))
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    db = get_supabase_db()
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp_code = _generate_otp_code()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=FORGOT_PASSWORD_OTP_TTL_SECONDS)
    FORGOT_PASSWORD_OTP_STORE[email] = {
        "otp_code": otp_code,
        "expires_at": expires_at,
    }

    return {
        "status": "success",
        "message": "OTP generated successfully",
        "data": {
            "otp_code": otp_code,
            "expires_in_seconds": FORGOT_PASSWORD_OTP_TTL_SECONDS,
        },
    }


@router.get("/me", response_model=UserResponse)
def get_me(email: str):
    """Get current user by email (pass as query param for now)."""
    db = get_supabase_db()
    user = db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_response(user)


@router.get("/users", response_model=List[UserResponse])
def list_users(authorization: Optional[str] = Header(default=None)):
    """Admin: list all registered users."""
    _require_admin_user(authorization)
    db = get_supabase_db()
    rows = db.get_all_users()
    return [_row_to_response(r) for r in rows]


@router.get("/users/role/{role}", response_model=List[UserResponse])
def list_users_by_role(role: str, authorization: Optional[str] = Header(default=None)):
    """Admin: list users of a specific role (farmer, buyer, transporter, store, admin)."""
    _require_admin_user(authorization)
    allowed = {"farmer", "seller", "buyer", "local_buyer", "worker", "equipment_owner", "transporter", "store", "admin"}
    normalized = role.strip().lower()
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail="Invalid role")

    db = get_supabase_db()
    rows = db.get_users_by_role(normalized)
    return [_row_to_response(r) for r in rows]


@router.get("/users/segregated")
def list_users_segregated(authorization: Optional[str] = Header(default=None)):
    """Admin: grouped users for separate management of all account types."""
    _require_admin_user(authorization)
    db = get_supabase_db()
    grouped = db.get_users_grouped_by_role()
    safe_grouped = {
        role: [_response_to_dict(_row_to_response(u)) for u in users]
        for role, users in grouped.items()
    }
    return {
        "status": "success",
        "data": {
            "groups": safe_grouped,
            "counts": {k: len(v) for k, v in safe_grouped.items()},
            "total": sum(len(v) for v in safe_grouped.values()),
        },
    }


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str, authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    db = get_supabase_db()
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_response(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: str, authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    db = get_supabase_db()
    ok = db.delete_user(user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found or delete failed")
    return {"status": "deleted", "id": user_id}


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: str, payload: dict = Body(...), authorization: Optional[str] = Header(default=None)):
    """Admin: update user settings like role, status, phone, location."""
    _require_admin_user(authorization)
    db = get_supabase_db()
    allowed_keys = {
        "name",
        "phone",
        "user_type",
        "business_name",
        "location",
        "gst_number",
        "vehicle_type",
        "license_number",
        "store_type",
        "farm_size",
        "is_active",
    }
    update_data = {k: v for k, v in payload.items() if k in allowed_keys}

    if "user_type" in update_data:
        role = str(update_data["user_type"]).strip().lower()
        if role not in {"farmer", "seller", "buyer", "local_buyer", "worker", "equipment_owner", "transporter", "store", "admin"}:
            raise HTTPException(status_code=400, detail="Invalid user_type")
        update_data["user_type"] = role

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields provided")

    row = db.update_user(user_id, update_data)
    if not row:
        raise HTTPException(status_code=404, detail="User not found or update failed")
    return _row_to_response(row)


@router.get("/admin/users-settings")
def get_users_admin_settings(authorization: Optional[str] = Header(default=None)):
    """Admin: get account-control settings for all registered users."""
    _require_admin_user(authorization)
    db = get_supabase_db()
    rows = db.get_all_users()
    user_ids = [str(r.get("id")).strip() for r in rows if r.get("id") is not None]
    settings = db.get_admin_settings_for_users(user_ids)
    return {
        "status": "success",
        "data": {
            "settings": settings,
            "count": len(settings),
        },
    }


@router.get("/users/{user_id}/admin-settings")
def get_user_admin_settings(user_id: str, authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    db = get_supabase_db()
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    settings = db.get_user_admin_settings(user_id)
    return {
        "status": "success",
        "data": {
            "user_id": user_id,
            "settings": settings,
        },
    }


@router.patch("/users/{user_id}/admin-settings")
def update_user_admin_settings(user_id: str, payload: dict = Body(...), authorization: Optional[str] = Header(default=None)):
    """Admin: update KYC/approval/lock/activity metadata for one account."""
    _require_admin_user(authorization)
    db = get_supabase_db()
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_keys = {
        "kyc_verified",
        "approved",
        "access_locked",
        "operating_system",
        "notes",
        "last_activity_at",
    }
    updates = {k: v for k, v in payload.items() if k in allowed_keys}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid settings provided")

    settings = db.update_user_admin_settings(user_id, updates)
    return {
        "status": "success",
        "data": {
            "user_id": user_id,
            "settings": settings,
        },
    }


@router.get("/admin/auth-audit")
def get_auth_audit(role: str = Query(default="all"), authorization: Optional[str] = Header(default=None)):
    """Admin: view registration/login audit by role."""
    _require_admin_user(authorization)
    db = get_supabase_db()
    rows = db.get_auth_audit_rows()

    normalized_role = role.strip().lower()
    if normalized_role != "all":
        rows = [r for r in rows if str(r.get("role", "")).lower() == normalized_role]

    return {
        "status": "success",
        "data": {
            "rows": rows,
            "count": len(rows),
            "role": normalized_role,
        },
    }


@router.get("/admin/network/overview")
def get_account_network_overview(authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    db = get_supabase_db()

    requests = db.list_account_network_requests()
    users = db.get_all_users()
    accepted = [row for row in requests if str(row.get("status", "")).strip().lower() == "accepted"]
    pending = [row for row in requests if str(row.get("status", "")).strip().lower() == "pending"]
    rejected = [row for row in requests if str(row.get("status", "")).strip().lower() == "rejected"]
    removed = [row for row in requests if str(row.get("status", "")).strip().lower() == "removed"]

    connections_by_user = {}
    for row in accepted:
        try:
            requester_id = int(row.get("requester_id", -1))
            target_id = int(row.get("target_id", -1))
        except Exception:
            continue
        connections_by_user[requester_id] = connections_by_user.get(requester_id, 0) + 1
        connections_by_user[target_id] = connections_by_user.get(target_id, 0) + 1

    users_by_id = {}
    for user in users:
        try:
            users_by_id[int(user.get("id", -1))] = user
        except Exception:
            continue

    top_connected = []
    for user_id, count in sorted(connections_by_user.items(), key=lambda item: item[1], reverse=True)[:8]:
        row = users_by_id.get(user_id, {})
        top_connected.append(
            {
                "user_id": user_id,
                "name": row.get("name"),
                "email": row.get("email"),
                "role": _normalize_network_role(row.get("user_type", "farmer")),
                "connections": count,
            }
        )

    role_summary = {}
    for row in users:
        role = _normalize_network_role(row.get("user_type", "farmer"))
        role_summary[role] = role_summary.get(role, 0) + 1

    heatmap_roles = list(NETWORK_ROLE_ORDER)
    heatmap_matrix = {
        role: {inner_role: 0 for inner_role in heatmap_roles}
        for role in heatmap_roles
    }
    max_links = 0
    for row in accepted:
        requester_role = _normalize_network_role(row.get("requester_role", "farmer"))
        target_role = _normalize_network_role(row.get("target_role", "farmer"))
        if requester_role not in heatmap_matrix:
            heatmap_matrix[requester_role] = {inner_role: 0 for inner_role in heatmap_roles}
            heatmap_roles.append(requester_role)
            for role in heatmap_matrix:
                heatmap_matrix[role].setdefault(requester_role, 0)
        if target_role not in heatmap_matrix:
            heatmap_matrix[target_role] = {inner_role: 0 for inner_role in heatmap_roles}
            heatmap_roles.append(target_role)
            for role in heatmap_matrix:
                heatmap_matrix[role].setdefault(target_role, 0)

        heatmap_matrix[requester_role][target_role] = int(heatmap_matrix[requester_role].get(target_role, 0)) + 1
        if requester_role != target_role:
            heatmap_matrix[target_role][requester_role] = int(heatmap_matrix[target_role].get(requester_role, 0)) + 1

    for row_values in heatmap_matrix.values():
        for count in row_values.values():
            max_links = max(max_links, int(count or 0))

    return {
        "status": "success",
        "data": {
            "summary": {
                "total_users": len(users),
                "total_requests": len(requests),
                "accepted": len(accepted),
                "pending": len(pending),
                "rejected": len(rejected),
                "removed": len(removed),
            },
            "roles": role_summary,
            "top_connected": top_connected,
            "role_to_role_heatmap": {
                "role_order": heatmap_roles,
                "matrix": heatmap_matrix,
                "max_links": max_links,
            },
        },
    }


@router.get("/admin/network/settings")
def get_account_network_settings(authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    db = get_supabase_db()
    settings = db.get_account_network_settings()
    return {
        "status": "success",
        "data": {
            "settings": settings,
        },
    }


@router.put("/admin/network/settings")
def update_account_network_settings(payload: dict = Body(...), authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    db = get_supabase_db()
    allowed_keys = {
        "allow_auto_recommendations",
        "allow_cross_role_connections",
        "allow_location_boost",
        "max_suggestions",
    }
    updates = {k: v for k, v in payload.items() if k in allowed_keys}
    if "max_suggestions" in updates:
        try:
            updates["max_suggestions"] = max(5, min(100, int(updates["max_suggestions"])))
        except Exception:
            updates["max_suggestions"] = 30

    settings = db.update_account_network_settings(updates)
    return {
        "status": "success",
        "data": {
            "settings": settings,
        },
    }


@router.post("/admin/auth-audit/reset-failures")
def reset_auth_failures(payload: dict = Body(...), authorization: Optional[str] = Header(default=None)):
    """Admin: reset failed attempt counter for one email."""
    _require_admin_user(authorization)
    email = str(payload.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    db = get_supabase_db()
    updated = db.reset_failed_attempts(email)
    if not updated:
        raise HTTPException(status_code=404, detail="Audit record not found")

    return {
        "status": "success",
        "data": {
            "email": email,
            "record": updated,
        },
    }


@router.post("/admin/import-users")
def import_users(payload: dict = Body(...), authorization: Optional[str] = Header(default=None)):
    """Admin: bulk import users from parsed CSV rows."""
    _require_admin_user(authorization)
    rows = payload.get("rows")
    created_by = str(payload.get("created_by", "admin-import")).strip() or "admin-import"

    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="rows must be a non-empty array")

    db = get_supabase_db()
    allowed_roles = {"farmer", "seller", "buyer", "transporter", "store", "admin"}
    created = []
    skipped = []
    failed = []

    for index, raw in enumerate(rows, start=1):
        if not isinstance(raw, dict):
            failed.append({"row": index, "reason": "Invalid row format"})
            continue

        name = str(raw.get("name", "")).strip()
        email = str(raw.get("email", "")).strip().lower()
        password = str(raw.get("password", "")).strip()
        phone = str(raw.get("phone", "")).strip()
        role = str(raw.get("user_type", "farmer")).strip().lower() or "farmer"

        if not name or not email or not password:
            failed.append({"row": index, "email": email or None, "reason": "name, email, and password are required"})
            continue

        if role not in allowed_roles:
            failed.append({"row": index, "email": email, "reason": "Invalid user_type"})
            continue

        existing = db.get_user_by_email(email)
        if existing:
            skipped.append({"row": index, "email": email, "reason": "Email already registered"})
            continue

        new_user_data = {
            "name": name,
            "email": email,
            "phone": phone,
            "password": get_password_hash(password),
            "user_type": role,
            "business_name": raw.get("business_name"),
            "location": raw.get("location"),
            "gst_number": raw.get("gst_number"),
            "vehicle_type": raw.get("vehicle_type"),
            "license_number": raw.get("license_number"),
            "store_type": raw.get("store_type"),
            "farm_size": raw.get("farm_size"),
            "is_active": bool(raw.get("is_active", True)),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            row = db.create_user(new_user_data)
            db.record_user_registered(row, created_by=created_by)
            created.append({"row": index, "email": email, "id": row.get("id"), "role": role})
        except RuntimeError as exc:
            failed.append({"row": index, "email": email, "reason": str(exc)})

    return {
        "status": "success",
        "data": {
            "created": created,
            "skipped": skipped,
            "failed": failed,
            "summary": {
                "created": len(created),
                "skipped": len(skipped),
                "failed": len(failed),
                "total": len(rows),
            },
        },
    }


@router.get("/network/suggestions")
def list_network_suggestions(
    role: str = Query(default="all"),
    q: str = Query(default=""),
    limit: int = Query(default=30, ge=1, le=100),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()
    all_users = db.get_all_users()
    all_requests = db.list_account_network_requests()
    network_settings = db.get_account_network_settings()

    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")
    current_role = _normalize_network_role(current_user.get("user_type", "farmer"))
    current_location = str(current_user.get("location") or "").strip().lower()
    preferred_roles = _recommended_roles_for(current_role)
    normalized_role = _normalize_network_role(role)
    if normalized_role not in SUPPORTED_NETWORK_ROLES and normalized_role != "all":
        raise HTTPException(status_code=400, detail="Invalid role filter")

    query_text = str(q or "").strip().lower()
    allow_auto_recommendations = bool(network_settings.get("allow_auto_recommendations", True))
    allow_cross_role = bool(network_settings.get("allow_cross_role_connections", True))
    allow_location_boost = bool(network_settings.get("allow_location_boost", True))
    max_suggestions = int(network_settings.get("max_suggestions", limit) or limit)
    max_suggestions = max(5, min(100, max_suggestions))

    accepted_ids = set()
    incoming_pending_ids = set()
    outgoing_pending_ids = set()

    for row in all_requests:
        requester_id = _normalize_id(row.get("requester_id"))
        target_id = _normalize_id(row.get("target_id"))
        if not requester_id or not target_id:
            continue

        status = str(row.get("status", "")).strip().lower()
        if status == "accepted":
            if requester_id == current_user_id:
                accepted_ids.add(target_id)
            elif target_id == current_user_id:
                accepted_ids.add(requester_id)
        elif status == "pending":
            if requester_id == current_user_id:
                outgoing_pending_ids.add(target_id)
            elif target_id == current_user_id:
                incoming_pending_ids.add(requester_id)

    results = []
    for user_row in all_users:
        user_id = _normalize_id(user_row.get("id"))
        if not user_id:
            continue

        if user_id == current_user_id:
            continue

        user_role = _normalize_network_role(user_row.get("user_type", "farmer"))
        if normalized_role != "all" and user_role != normalized_role:
            continue
        if not allow_cross_role and user_role != current_role:
            continue

        if not bool(user_row.get("is_active", True)):
            continue

        if query_text:
            haystack = " ".join(
                [
                    str(user_row.get("name", "")),
                    str(user_row.get("email", "")),
                    str(user_row.get("location", "")),
                    str(user_row.get("business_name", "")),
                    user_role,
                ]
            ).lower()
            if query_text not in haystack:
                continue

        relation_status = "none"
        if user_id in accepted_ids:
            relation_status = "connected"
        elif user_id in incoming_pending_ids:
            relation_status = "incoming_pending"
        elif user_id in outgoing_pending_ids:
            relation_status = "outgoing_pending"

        score = 0
        user_location = str(user_row.get("location") or "").strip().lower()
        if allow_auto_recommendations and user_role in preferred_roles:
            score += 50
        if allow_location_boost and current_location and user_location and current_location == user_location:
            score += 30
        if relation_status == "none":
            score += 20
        if relation_status == "incoming_pending":
            score += 10

        reason = "Good match"
        if allow_auto_recommendations and user_role in preferred_roles and allow_location_boost and current_location and user_location and current_location == user_location:
            reason = "Role match + same location"
        elif allow_auto_recommendations and user_role in preferred_roles:
            reason = "Role match"
        elif allow_location_boost and current_location and user_location and current_location == user_location:
            reason = "Same location"

        results.append(
            {
                **_safe_user_preview(user_row),
                "relation_status": relation_status,
                "is_mutual": relation_status == "connected",
                "recommendation_score": score,
                "recommendation_reason": reason,
            }
        )

    results.sort(
        key=lambda row: (
            -int(row.get("recommendation_score", 0)),
            row.get("relation_status") != "none",
            str(row.get("name") or "").lower(),
        )
    )

    return {
        "status": "success",
        "data": {
            "users": results[: min(limit, max_suggestions)],
            "filters": {
                "role": normalized_role,
                "query": query_text,
                "limit": min(limit, max_suggestions),
            },
            "counts": {
                "total": len(results),
                "connected": len([u for u in results if u.get("relation_status") == "connected"]),
                "incoming_pending": len([u for u in results if u.get("relation_status") == "incoming_pending"]),
                "outgoing_pending": len([u for u in results if u.get("relation_status") == "outgoing_pending"]),
            },
        },
    }


@router.get("/network/requests/incoming")
def list_incoming_network_requests(authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    rows = []
    for row in db.list_account_network_requests():
        if str(row.get("status", "")).strip().lower() != "pending":
            continue
        target_id = _normalize_id(row.get("target_id"))
        if target_id == current_user_id:
            rows.append(row)
    rows.sort(key=lambda r: str(r.get("created_at", "")), reverse=True)

    return {
        "status": "success",
        "data": {
            "requests": rows,
            "count": len(rows),
        },
    }


@router.get("/network/requests/outgoing")
def list_outgoing_network_requests(authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    rows = []
    for row in db.list_account_network_requests():
        if str(row.get("status", "")).strip().lower() != "pending":
            continue
        requester_id = _normalize_id(row.get("requester_id"))
        if requester_id == current_user_id:
            rows.append(row)
    rows.sort(key=lambda r: str(r.get("created_at", "")), reverse=True)

    return {
        "status": "success",
        "data": {
            "requests": rows,
            "count": len(rows),
        },
    }


@router.post("/network/requests")
def create_network_request(payload: dict = Body(...), authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()

    current_user_id = _normalize_id(current_user.get("id"))
    target_user_id = _normalize_id(payload.get("target_user_id"))
    message = str(payload.get("message", "")).strip()[:300]

    if not target_user_id:
        raise HTTPException(status_code=400, detail="target_user_id is required")
    if target_user_id == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot connect your own account")

    target_user = db.get_user_by_id(target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    all_requests = db.list_account_network_requests()
    for row in all_requests:
        if not _users_pair_matches(row, current_user_id, target_user_id):
            continue

        status = str(row.get("status", "")).strip().lower()
        if status == "accepted":
            raise HTTPException(status_code=400, detail="You are already connected")
        if status == "pending":
            raise HTTPException(status_code=409, detail="A pending request already exists")

    created = db.create_account_network_request(
        {
            "requester_id": current_user_id,
            "requester_email": current_user.get("email"),
            "requester_name": current_user.get("name"),
            "requester_role": _normalize_network_role(current_user.get("user_type", "farmer")),
            "target_id": _normalize_id(target_user.get("id")),
            "target_email": target_user.get("email"),
            "target_name": target_user.get("name"),
            "target_role": _normalize_network_role(target_user.get("user_type", "farmer")),
            "status": "pending",
            "message": message,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {
        "status": "success",
        "message": "Connection request sent",
        "data": {
            "request": created,
        },
    }


@router.patch("/network/requests/{request_id}/respond")
def respond_network_request(
    request_id: str,
    payload: dict = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()

    action = str(payload.get("action", "")).strip().lower()
    if action not in {"accept", "reject"}:
        raise HTTPException(status_code=400, detail="action must be accept or reject")

    request_row = db.get_account_network_request(request_id)
    if not request_row:
        raise HTTPException(status_code=404, detail="Request not found")

    request_target_id = _normalize_id(request_row.get("target_id"))
    current_user_id = _normalize_id(current_user.get("id"))
    if request_target_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only receiver can respond")

    if str(request_row.get("status", "")).strip().lower() != "pending":
        raise HTTPException(status_code=400, detail="Request already resolved")

    updated = db.update_account_network_request(
        request_id,
        {
            "status": "accepted" if action == "accept" else "rejected",
            "responded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Request update failed")

    return {
        "status": "success",
        "message": "Request accepted" if action == "accept" else "Request rejected",
        "data": {
            "request": updated,
        },
    }


@router.get("/network/connections")
def list_network_connections(authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    rows = db.list_user_connections(current_user_id)
    connections = []
    for row in rows:
        requester_id = _normalize_id(row.get("requester_id"))
        target_id = _normalize_id(row.get("target_id"))
        if not requester_id or not target_id:
            continue
        is_requester = requester_id == current_user_id

        partner = {
            "id": target_id if is_requester else requester_id,
            "name": row.get("target_name") if is_requester else row.get("requester_name"),
            "email": row.get("target_email") if is_requester else row.get("requester_email"),
            "role": row.get("target_role") if is_requester else row.get("requester_role"),
            "connected_at": row.get("responded_at") or row.get("updated_at") or row.get("created_at"),
            "request_id": row.get("id"),
            "is_mutual": True,
        }
        connections.append(partner)

    connections.sort(key=lambda r: str(r.get("connected_at", "")), reverse=True)
    return {
        "status": "success",
        "data": {
            "connections": connections,
            "count": len(connections),
        },
    }


@router.delete("/network/connections/{request_id}")
def remove_network_connection(request_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()

    request_row = db.get_account_network_request(request_id)
    if not request_row:
        raise HTTPException(status_code=404, detail="Connection not found")

    current_user_id = _normalize_id(current_user.get("id"))
    requester_id = _normalize_id(request_row.get("requester_id"))
    target_id = _normalize_id(request_row.get("target_id"))
    if current_user_id not in {requester_id, target_id}:
        raise HTTPException(status_code=403, detail="You can only remove your own connection")

    status = str(request_row.get("status", "")).strip().lower()
    if status != "accepted":
        raise HTTPException(status_code=400, detail="Only accepted connections can be removed")

    updated = db.update_account_network_request(
        request_id,
        {
            "status": "removed",
            "removed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Connection update failed")

    return {
        "status": "success",
        "message": "Connection removed successfully",
        "data": {
            "request": updated,
        },
    }


@router.delete("/network/requests/{request_id}/cancel")
def cancel_outgoing_network_request(request_id: str, authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    db = get_supabase_db()

    request_row = db.get_account_network_request(request_id)
    if not request_row:
        raise HTTPException(status_code=404, detail="Request not found")

    current_user_id = _normalize_id(current_user.get("id"))
    requester_id = _normalize_id(request_row.get("requester_id"))
    if current_user_id != requester_id:
        raise HTTPException(status_code=403, detail="Only sender can cancel outgoing request")

    status = str(request_row.get("status", "")).strip().lower()
    if status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled")

    updated = db.update_account_network_request(
        request_id,
        {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Request update failed")

    return {
        "status": "success",
        "message": "Outgoing request cancelled",
        "data": {
            "request": updated,
        },
    }


@router.get("/network/social-hub")
def get_network_social_hub_state(authorization: Optional[str] = Header(default=None)):
    current_user = _require_authenticated_user(authorization)
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    state_store = get_dashboard_state_store()
    scope = _social_hub_scope(current_user_id)
    payload = state_store.get_state(scope, _social_hub_default_state())
    payload = _sanitize_social_hub_payload(payload)

    return {
        "status": "success",
        "data": {
            "scope": scope,
            "state": payload,
        },
    }


@router.put("/network/social-hub")
def upsert_network_social_hub_state(
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_authenticated_user(authorization)
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    state_store = get_dashboard_state_store()
    scope = _social_hub_scope(current_user_id)
    sanitized = _sanitize_social_hub_payload(payload)
    saved = state_store.save_state(scope, sanitized)

    return {
        "status": "success",
        "message": "Social hub state saved",
        "data": {
            "scope": scope,
            "state": saved,
        },
    }


@router.post("/network/social-hub/video-action")
def apply_social_hub_video_action(
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_authenticated_user(authorization)
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    video_id = str(payload.get("video_id") or "").strip()
    action = str(payload.get("action") or "").strip().lower()
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id is required")
    if action not in {"like", "comment", "share", "follow"}:
        raise HTTPException(status_code=400, detail="action must be one of like/comment/share/follow")

    state_store = get_dashboard_state_store()
    scope = _social_hub_scope(current_user_id)
    state = _sanitize_social_hub_payload(state_store.get_state(scope, _social_hub_default_state()))

    stats = state.get("video_stats") or {}
    current_stats = stats.get(video_id) or {
        "likes": 0,
        "comments": 0,
        "shares": 0,
        "followed": False,
    }

    if action == "like":
        current_stats["likes"] = int(current_stats.get("likes") or 0) + 1
    elif action == "comment":
        current_stats["comments"] = int(current_stats.get("comments") or 0) + 1
    elif action == "share":
        current_stats["shares"] = int(current_stats.get("shares") or 0) + 1
    elif action == "follow":
        current_stats["followed"] = not bool(current_stats.get("followed"))

    stats[video_id] = current_stats
    state["video_stats"] = stats
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    saved = state_store.save_state(scope, state)

    return {
        "status": "success",
        "message": "Video action applied",
        "data": {
            "video_id": video_id,
            "stats": saved.get("video_stats", {}).get(video_id, current_stats),
        },
    }


@router.post("/network/social-hub/feed-action")
def apply_social_hub_feed_action(
    payload: Dict[str, Any] = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_authenticated_user(authorization)
    current_user_id = _normalize_id(current_user.get("id"))
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid user id in token")

    post_id = str(payload.get("post_id") or "").strip()
    action = str(payload.get("action") or "").strip().lower()
    comment_text = str(payload.get("comment_text") or "").strip()[:200]

    if not post_id:
        raise HTTPException(status_code=400, detail="post_id is required")
    if action not in {"like", "comment", "share"}:
        raise HTTPException(status_code=400, detail="action must be one of like/comment/share")

    state_store = get_dashboard_state_store()
    scope = _social_hub_scope(current_user_id)
    state = _sanitize_social_hub_payload(state_store.get_state(scope, _social_hub_default_state()))

    posts = state.get("feed_posts") or []
    updated_post = None
    for idx, post in enumerate(posts):
        if str(post.get("id") or "") != post_id:
            continue

        next_post = dict(post)
        if action == "like":
            next_post["likes"] = int(next_post.get("likes") or 0) + 1
        elif action == "share":
            next_post["shares"] = int(next_post.get("shares") or 0) + 1
        elif action == "comment":
            next_post["comments"] = int(next_post.get("comments") or 0) + 1
            comments = list(next_post.get("recent_comments") or [])
            if comment_text:
                comments.insert(0, {
                    "text": comment_text,
                    "by": str(current_user.get("name") or current_user.get("email") or "User"),
                    "at": datetime.now(timezone.utc).isoformat(),
                })
            next_post["recent_comments"] = comments[:20]

        posts[idx] = next_post
        updated_post = next_post
        break

    if updated_post is None:
        raise HTTPException(status_code=404, detail="Feed post not found")

    state["feed_posts"] = posts
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    saved = state_store.save_state(scope, state)

    return {
        "status": "success",
        "message": "Feed action applied",
        "data": {
            "post": next((p for p in saved.get("feed_posts", []) if str(p.get("id") or "") == post_id), updated_post),
        },
    }
