from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Body, Query

from app.services.supabase_state_store import get_dashboard_state_store

router = APIRouter()

state_store = get_dashboard_state_store()

PROFILE_COMMON_SCOPE = "profile_common"
ROLE_SCOPE_MAP = {
    "farmer": "farmer_details",
    "buyer": "buyer_details",
    "local_buyer": "local_buyer_details",
    "transporter": "transporter_details",
    "store": "storage_details",
    "storage_owner": "storage_details",
}

COMMON_ALLOWED_FIELDS = {
    "profile_photo",
    "full_name",
    "mobile_number",
    "email",
    "address",
    "city",
    "state",
    "id_verification",
    "account_role",
}

ROLE_ALLOWED_FIELDS = {
    "farmer": {
        "farmer_name",
        "farm_name",
        "farm_location",
        "land_area",
        "crop_types",
        "expected_harvest",
        "harvest_date",
        "bank_details",
        "storage_requirement",
    },
    "buyer": {
        "buyer_name",
        "business_name",
        "buyer_type",
        "delivery_address",
        "preferred_crops",
        "purchase_quantity",
        "payment_method",
    },
    "local_buyer": {
        "shop_name",
        "owner_name",
        "location",
        "preferred_crops",
        "daily_demand",
        "payment_method",
    },
    "transporter": {
        "transporter_name",
        "company_name",
        "vehicle_type",
        "vehicle_number",
        "load_capacity",
        "service_area",
        "driving_license",
        "bank_details",
    },
    "store": {
        "owner_name",
        "warehouse_name",
        "location",
        "storage_capacity",
        "available_space",
        "storage_type",
        "price_per_day",
        "security_features",
    },
}


def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_role(raw_role: str) -> str:
    role = str(raw_role or "farmer").strip().lower()
    if role in {"storage", "store_owner", "warehouse"}:
        return "store"
    if role == "seller":
        return "farmer"
    if role not in {"farmer", "buyer", "local_buyer", "transporter", "store", "admin"}:
        return "farmer"
    return role


def _scope_for_role(role: str) -> str:
    normalized = _normalize_role(role)
    return ROLE_SCOPE_MAP.get(normalized, "farmer_details")


def _default_common_profile(user_context: Dict[str, Any]) -> Dict[str, Any]:
    created_at = user_context.get("created_at")
    created_value = str(created_at) if created_at else datetime.now(timezone.utc).isoformat()
    role = _normalize_role(user_context.get("user_type") or user_context.get("role") or "farmer")

    return {
        "profile_photo": "",
        "full_name": user_context.get("name") or "",
        "mobile_number": user_context.get("phone") or "",
        "email": user_context.get("email") or "",
        "address": user_context.get("location") or "",
        "city": "",
        "state": "",
        "id_verification": "",
        "account_role": role,
        "created_date": created_value,
    }


def _default_role_profile(role: str, common_profile: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_role(role)

    if normalized == "buyer":
        return {
            "buyer_name": common_profile.get("full_name") or "",
            "business_name": "",
            "buyer_type": "",
            "delivery_address": common_profile.get("address") or "",
            "preferred_crops": [],
            "purchase_quantity": "",
            "payment_method": "",
        }

    if normalized == "local_buyer":
        return {
            "shop_name": "",
            "owner_name": common_profile.get("full_name") or "",
            "location": common_profile.get("address") or "",
            "preferred_crops": [],
            "daily_demand": "",
            "payment_method": "",
        }

    if normalized == "transporter":
        return {
            "transporter_name": common_profile.get("full_name") or "",
            "company_name": "",
            "vehicle_type": "",
            "vehicle_number": "",
            "load_capacity": "",
            "service_area": [],
            "driving_license": "",
            "bank_details": "",
        }

    if normalized == "store":
        return {
            "owner_name": common_profile.get("full_name") or "",
            "warehouse_name": "",
            "location": common_profile.get("address") or "",
            "storage_capacity": "",
            "available_space": "",
            "storage_type": "",
            "price_per_day": "",
            "security_features": [],
        }

    return {
        "farmer_name": common_profile.get("full_name") or "",
        "farm_name": "",
        "farm_location": common_profile.get("address") or "",
        "land_area": "",
        "crop_types": [],
        "expected_harvest": "",
        "harvest_date": "",
        "bank_details": "",
        "storage_requirement": "",
    }


def _normalize_role_profile(role: str, role_profile: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_role(role)
    allowed = ROLE_ALLOWED_FIELDS.get(normalized, ROLE_ALLOWED_FIELDS["farmer"])
    cleaned = {k: v for k, v in role_profile.items() if k in allowed}

    for list_field in {"crop_types", "preferred_crops", "service_area", "security_features"}:
        if list_field in cleaned and not isinstance(cleaned[list_field], list):
            raw = str(cleaned[list_field] or "").strip()
            cleaned[list_field] = [item.strip() for item in raw.split(",") if item.strip()] if raw else []

    return cleaned


def _normalize_common_profile(common_profile: Dict[str, Any], role: str, created_date: str) -> Dict[str, Any]:
    cleaned = {k: v for k, v in common_profile.items() if k in COMMON_ALLOWED_FIELDS}
    cleaned["account_role"] = _normalize_role(cleaned.get("account_role") or role)
    cleaned["created_date"] = created_date
    return cleaned


def _seed_common_profile_if_missing(user_id: str, user_context: Dict[str, Any]) -> None:
    if not user_context:
        return
    common_payload = _safe_dict(state_store.get_state(PROFILE_COMMON_SCOPE, {}))
    key = str(user_id)
    if key in common_payload:
        return
    common_payload[key] = _default_common_profile(user_context)
    state_store.save_state(PROFILE_COMMON_SCOPE, common_payload)


def _load_full_profile(user_id: str, preferred_role: str = "") -> Dict[str, Any]:
    key = str(user_id)
    common_payload = _safe_dict(state_store.get_state(PROFILE_COMMON_SCOPE, {}))
    existing_common = _safe_dict(common_payload.get(key, {}))
    common_default = _default_common_profile({})
    role = _normalize_role(existing_common.get("account_role", "farmer"))

    preferred = _normalize_role(preferred_role)
    # If existing profile was incorrectly saved as farmer, trust explicit runtime role.
    if preferred and preferred != "farmer" and (role == "farmer" or role != preferred):
        role = preferred

    common = _normalize_common_profile({**common_default, **existing_common}, role, common_default["created_date"])
    role = _normalize_role(common.get("account_role", role))

    if preferred and preferred != "farmer" and (role == "farmer" or role != preferred):
        role = preferred

    common["account_role"] = role

    role_scope = _scope_for_role(role)
    role_payload = _safe_dict(state_store.get_state(role_scope, {}))
    existing_role = _safe_dict(role_payload.get(key, {}))
    role_default = _default_role_profile(role, common)
    role_profile = _normalize_role_profile(role, {**role_default, **existing_role})

    return {
        "user_id": user_id,
        "role": role,
        "common_profile": common,
        "role_profile": role_profile,
    }


@router.get("/{user_id}")
def get_profile(
    user_id: str,
    name: str = Query(default=""),
    email: str = Query(default=""),
    phone: str = Query(default=""),
    location: str = Query(default=""),
    role: str = Query(default="farmer"),
    created_at: str = Query(default=""),
):
    _seed_common_profile_if_missing(
        user_id,
        {
            "name": name,
            "email": email,
            "phone": phone,
            "location": location,
            "role": role,
            "created_at": created_at,
        },
    )

    profile_data = _load_full_profile(user_id, role)

    # Persist corrected role to avoid repeated farmer fallback for local_buyer/shop users.
    if _normalize_role(role) != _normalize_role(profile_data["common_profile"].get("account_role", "farmer")):
        profile_data["common_profile"]["account_role"] = _normalize_role(role)

    # Avoid write-on-read behavior: save only when profile payload actually changed.
    common_payload = _safe_dict(state_store.get_state(PROFILE_COMMON_SCOPE, {}))
    user_key = str(user_id)
    existing_common = _safe_dict(common_payload.get(user_key, {}))
    if existing_common != profile_data["common_profile"]:
        common_payload[user_key] = profile_data["common_profile"]
        state_store.save_state(PROFILE_COMMON_SCOPE, common_payload)

    return {
        "status": "success",
        "data": profile_data,
    }


@router.patch("/{user_id}")
def update_profile(user_id: str, payload: Dict[str, Any] = Body(...)):
    user_context = _safe_dict(payload.get("user_context", {}))
    _seed_common_profile_if_missing(user_id, user_context)

    current = _load_full_profile(user_id)
    role = _normalize_role(current.get("role", user_context.get("role", "farmer")))

    requested_common = _safe_dict(payload.get("common_profile", {}))
    merged_common = _normalize_common_profile(
        {**current["common_profile"], **requested_common},
        role,
        current["common_profile"].get("created_date", datetime.now(timezone.utc).isoformat()),
    )

    requested_role = _safe_dict(payload.get("role_profile", {}))
    merged_role = _normalize_role_profile(role, {**current["role_profile"], **requested_role})

    common_payload = _safe_dict(state_store.get_state(PROFILE_COMMON_SCOPE, {}))
    common_payload[str(user_id)] = merged_common
    state_store.save_state(PROFILE_COMMON_SCOPE, common_payload)

    role_scope = _scope_for_role(role)
    role_payload = _safe_dict(state_store.get_state(role_scope, {}))
    role_payload[str(user_id)] = merged_role
    state_store.save_state(role_scope, role_payload)

    return {
        "status": "success",
        "data": _load_full_profile(user_id),
    }
