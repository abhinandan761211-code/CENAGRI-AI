import copy
import time
from datetime import date, timedelta
import requests
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header, Response
from pydantic import BaseModel

from app.services.supabase_db import get_supabase_db
from app.services.supabase_state_store import get_dashboard_state_store
from app.utils.auth import decode_access_token

router = APIRouter()
state_store = get_dashboard_state_store()
LOCAL_SCOPE = "local_services"
EQUIPMENT_CATALOG_SCOPE = "equipment_catalog"
EQUIPMENT_BOOKINGS_SCOPE = "equipment_bookings"
EQUIPMENT_PAYMENTS_SCOPE = "equipment_payments"
GEOCODE_SUCCESS_TTL_SECONDS = 24 * 60 * 60
GEOCODE_FAILURE_TTL_SECONDS = 10 * 60
GEOCODE_CACHE = {}
GEOCODE_FAILURE_CACHE = {}


class WorkerBookingPayload(BaseModel):
    worker_id: int
    requester_name: Optional[str] = None
    days: int = 1


class EquipmentBookingPayload(BaseModel):
    equipment_id: int
    requester_name: Optional[str] = None
    days: int = 1
    booking_date: Optional[str] = None
    time_slot: Optional[str] = None
    location: Optional[str] = None
    payment_method: Optional[str] = None


class EquipmentCreatePayload(BaseModel):
    name: str
    type: str
    location: str
    rent_per_day: int
    rent_per_hour: Optional[int] = None
    image: Optional[str] = None
    distance_km: Optional[float] = None
    rating: Optional[float] = None
    availability_status: Optional[str] = None
    notes: Optional[str] = None
    available_from: Optional[str] = None
    available_to: Optional[str] = None


class EquipmentUpdatePayload(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    location: Optional[str] = None
    rent_per_day: Optional[int] = None
    rent_per_hour: Optional[int] = None
    image: Optional[str] = None
    distance_km: Optional[float] = None
    rating: Optional[float] = None
    availability_status: Optional[str] = None
    notes: Optional[str] = None
    available_from: Optional[str] = None
    available_to: Optional[str] = None


class EquipmentBookingUpdatePayload(BaseModel):
    status: Optional[str] = None
    days: Optional[int] = None


class EquipmentPaymentUpdatePayload(BaseModel):
    method: Optional[str] = None
    status: Optional[str] = None


class ProductPurchasePayload(BaseModel):
    product_id: int
    buyer_name: Optional[str] = None
    quantity: int = 1


class ProductCartPayload(BaseModel):
    product_id: int
    quantity: int = 1


class ProductManageCreatePayload(BaseModel):
    name: str
    category: str
    price: int
    quantity: int = 1
    unit: Optional[str] = "kg"
    image: Optional[str] = ""
    description: Optional[str] = ""
    location: Optional[str] = ""


class ProductManageUpdatePayload(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[int] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None


class ProductOrderStatusPayload(BaseModel):
    status: str


class LaborJobCreatePayload(BaseModel):
    work_type: str
    location: str
    wage_per_day: int
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None
    days: int = 1


class LaborJobStatusPayload(BaseModel):
    status: str


class LaborMessagePayload(BaseModel):
    text: str


class LaborReminderSettingsPayload(BaseModel):
    default_time: Optional[str] = None
    auto_enabled: Optional[bool] = None
    job_times: Optional[dict] = None


DEFAULT_STATE = {
    "workers": [
        {"id": 1, "name": "Ramesh Pawar", "skill": "Harvesting", "location": "Pune", "rate_per_day": 850, "rating": 4.7},
        {"id": 2, "name": "Sohan Yadav", "skill": "Irrigation", "location": "Nashik", "rate_per_day": 750, "rating": 4.5},
        {"id": 3, "name": "Arif Khan", "skill": "Spraying & Crop Care", "location": "Pune", "rate_per_day": 900, "rating": 4.8},
        {"id": 4, "name": "Mukesh Singh", "skill": "Land Preparation", "location": "Aurangabad", "rate_per_day": 820, "rating": 4.4},
    ],
    "equipment": [
        {"id": 1, "name": "Tractor 45HP", "owner": "Mahadev Agro", "owner_email": "mahadev.agro@example.com", "owner_phone": "9876500011", "location": "Pune", "rent_per_day": 3200, "rent_per_hour": 520, "type": "Tractor", "distance_km": 3, "rating": 4.8, "availability_status": "Available", "notes": "Best for tillage and hauling across medium farms.", "available_from": "2026-03-18", "available_to": "2026-03-29", "image": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80"},
        {"id": 2, "name": "Power Tiller", "owner": "Shiv Rentals", "owner_email": "shiv.rentals@example.com", "owner_phone": "9876500012", "location": "Nashik", "rent_per_day": 1800, "rent_per_hour": 320, "type": "Tiller", "distance_km": 8, "rating": 4.5, "availability_status": "Available", "notes": "Compact tiller for orchard and vegetable plots.", "available_from": "2026-03-17", "available_to": "2026-03-25", "image": "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=1200&q=80"},
        {"id": 3, "name": "Seeder Machine", "owner": "Farmlink Tools", "owner_email": "farmlink.tools@example.com", "owner_phone": "9876500013", "location": "Pune", "rent_per_day": 1400, "rent_per_hour": 240, "type": "Seeder", "distance_km": 5, "rating": 4.7, "availability_status": "Booked Soon", "notes": "Uniform row spacing with low fuel usage.", "available_from": "2026-03-20", "available_to": "2026-03-30", "image": "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80"},
        {"id": 4, "name": "Sprayer Unit", "owner": "Agri Assist", "owner_email": "agri.assist@example.com", "owner_phone": "9876500014", "location": "Aurangabad", "rent_per_day": 950, "rent_per_hour": 170, "type": "Sprayer", "distance_km": 12, "rating": 4.4, "availability_status": "Maintenance", "notes": "Protective gear included with calibrated nozzle set.", "available_from": "2026-03-22", "available_to": "2026-03-31", "image": "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1200&q=80"},
    ],
    "products": [
        {"id": 1, "name": "Wheat Seed Gold", "category": "Seeds", "seller": "Agro Center", "seller_location": "Village A", "location": "Village A", "distance_km": 2, "price": 120, "unit": "kg", "stock": 120, "image": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=900&q=80", "offer_percent": 10, "seller_phone": "9876543210", "rating": 4.7},
        {"id": 2, "name": "Paddy Seed Pro", "category": "Seeds", "seller": "Kisan Store", "seller_location": "Village B", "location": "Village B", "distance_km": 5, "price": 95, "unit": "kg", "stock": 200, "image": "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80", "offer_percent": 0, "seller_phone": "9876543220", "rating": 4.5},
        {"id": 3, "name": "Urea Boost", "category": "Fertilizers", "seller": "Agro Center", "seller_location": "Village A", "location": "Village A", "distance_km": 2, "price": 300, "unit": "bag", "stock": 90, "image": "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=900&q=80", "offer_percent": 8, "seller_phone": "9876543210", "rating": 4.7},
        {"id": 4, "name": "Organic Compost Mix", "category": "Fertilizers", "seller": "Hariyali Inputs", "seller_location": "Village C", "location": "Village C", "distance_km": 7, "price": 420, "unit": "bag", "stock": 64, "image": "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=900&q=80", "offer_percent": 5, "seller_phone": "9876543230", "rating": 4.6},
        {"id": 5, "name": "Neem Shield Spray", "category": "Pesticides", "seller": "Suraksha Agro", "seller_location": "Village D", "location": "Village D", "distance_km": 9, "price": 260, "unit": "litre", "stock": 48, "image": "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=900&q=80", "offer_percent": 12, "seller_phone": "9876543240", "rating": 4.4},
        {"id": 6, "name": "Fungal Guard", "category": "Pesticides", "seller": "Kisan Store", "seller_location": "Village B", "location": "Village B", "distance_km": 5, "price": 380, "unit": "bottle", "stock": 36, "image": "https://images.unsplash.com/photo-1615818499660-30bb5816e1c7?auto=format&fit=crop&w=900&q=80", "offer_percent": 0, "seller_phone": "9876543220", "rating": 4.5},
        {"id": 7, "name": "Sprayer Pump 16L", "category": "Farming Tools", "seller": "Tool House", "seller_location": "Village A", "location": "Village A", "distance_km": 3, "price": 1450, "unit": "piece", "stock": 22, "image": "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=900&q=80", "offer_percent": 15, "seller_phone": "9876543250", "rating": 4.8},
        {"id": 8, "name": "Hand Weeder", "category": "Farming Tools", "seller": "Tool House", "seller_location": "Village A", "location": "Village A", "distance_km": 3, "price": 280, "unit": "piece", "stock": 55, "image": "https://images.unsplash.com/photo-1615818499660-30bb5816e1c7?auto=format&fit=crop&w=900&q=80", "offer_percent": 0, "seller_phone": "9876543250", "rating": 4.8},
        {"id": 9, "name": "Fresh Onion Lot", "category": "Crop Produce", "seller": "Mandi Fresh Hub", "seller_location": "Village E", "location": "Village E", "distance_km": 6, "price": 28, "unit": "kg", "stock": 300, "image": "https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=900&q=80", "offer_percent": 6, "seller_phone": "9876543260", "rating": 4.3},
        {"id": 10, "name": "Premium Potato Bag", "category": "Crop Produce", "seller": "Mandi Fresh Hub", "seller_location": "Village E", "location": "Village E", "distance_km": 6, "price": 32, "unit": "kg", "stock": 240, "image": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80", "offer_percent": 4, "seller_phone": "9876543260", "rating": 4.3},
    ],
    "worker_bookings": [],
    "equipment_bookings": [],
    "product_orders": [],
    "product_carts": {},
    "job_messages": {},
    "labor_reminder_settings": {},
    "labor_jobs": [
        {
            "id": 201,
            "farmer_name": "Ramesh",
            "farmer_email": "ramesh@example.com",
            "farmer_phone": "",
            "work_type": "Harvesting",
            "location": "Village A",
            "wage_per_day": 500,
            "scheduled_date": "2026-03-18",
            "days": 1,
            "notes": "Wheat field section-2",
            "status": "Pending",
            "assigned_worker_name": "",
            "assigned_worker_email": "",
            "assigned_worker_phone": "",
        },
        {
            "id": 202,
            "farmer_name": "Mohan",
            "farmer_email": "mohan@example.com",
            "farmer_phone": "",
            "work_type": "Irrigation",
            "location": "Village B",
            "wage_per_day": 450,
            "scheduled_date": "2026-03-19",
            "days": 1,
            "notes": "Canal side plot",
            "status": "Pending",
            "assigned_worker_name": "",
            "assigned_worker_email": "",
            "assigned_worker_phone": "",
        },
        {
            "id": 203,
            "farmer_name": "Suresh",
            "farmer_email": "suresh@example.com",
            "farmer_phone": "",
            "work_type": "Planting",
            "location": "Village C",
            "wage_per_day": 550,
            "scheduled_date": "2026-03-20",
            "days": 2,
            "notes": "Vegetable nursery transplant",
            "status": "Pending",
            "assigned_worker_name": "",
            "assigned_worker_email": "",
            "assigned_worker_phone": "",
        },
        {
            "id": 204,
            "farmer_name": "Prakash",
            "farmer_email": "prakash@example.com",
            "farmer_phone": "",
            "work_type": "Fertilizer Spraying",
            "location": "Village A",
            "wage_per_day": 600,
            "scheduled_date": "2026-03-17",
            "days": 1,
            "notes": "Protective gear required",
            "status": "In Progress",
            "assigned_worker_name": "Token Bound User",
            "assigned_worker_email": "token.user.1773668174@example.com",
            "assigned_worker_phone": "",
        },
        {
            "id": 205,
            "farmer_name": "Mohan",
            "farmer_email": "mohan@example.com",
            "farmer_phone": "",
            "work_type": "Planting",
            "location": "Village D",
            "wage_per_day": 400,
            "scheduled_date": "2026-01-05",
            "days": 1,
            "notes": "Completed nursery line",
            "status": "Completed",
            "assigned_worker_name": "Token Bound User",
            "assigned_worker_email": "token.user.1773668174@example.com",
            "assigned_worker_phone": "",
            "payment_amount": 400,
            "completed_date": "2026-01-05",
        },
    ],
}


def _get_state():
    state = state_store.get_state(LOCAL_SCOPE, dict(DEFAULT_STATE))
    if "workers" not in state:
        state["workers"] = list(DEFAULT_STATE["workers"])
    if "equipment" not in state:
        state["equipment"] = list(DEFAULT_STATE["equipment"])
    else:
        equipment = state.get("equipment") or []
        if len(equipment) < 4 or any(
            "image" not in item or "availability_status" not in item or "owner_email" not in item
            for item in equipment
            if isinstance(item, dict)
        ):
            state["equipment"] = list(DEFAULT_STATE["equipment"])
    if "products" not in state:
        state["products"] = list(DEFAULT_STATE["products"])
    else:
        products = state.get("products") or []
        if len(products) < 8 or any("seller_location" not in item for item in products if isinstance(item, dict)):
            state["products"] = list(DEFAULT_STATE["products"])
    if "worker_bookings" not in state:
        state["worker_bookings"] = []
    if "equipment_bookings" not in state:
        state["equipment_bookings"] = []
    if "product_orders" not in state:
        state["product_orders"] = []
    if "product_carts" not in state or not isinstance(state.get("product_carts"), dict):
        state["product_carts"] = {}
    if "labor_jobs" not in state:
        state["labor_jobs"] = list(DEFAULT_STATE["labor_jobs"])
    if "job_messages" not in state:
        state["job_messages"] = {}
    if "labor_reminder_settings" not in state or not isinstance(state.get("labor_reminder_settings"), dict):
        state["labor_reminder_settings"] = {}
    return state


def _save_state(state):
    return state_store.save_state(LOCAL_SCOPE, state)


def _get_equipment_scope(scope: str, default):
    return state_store.get_state(scope, copy.deepcopy(default))


def _save_equipment_scope(scope: str, value):
    return state_store.save_state(scope, value)


def _normalize_phone(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    return raw


def _resolve_actor_name(name: Optional[str], fallback: str) -> str:
    value = str(name or "").strip()
    return value if value else fallback


def _normalize_equipment_status(value: Optional[str]) -> str:
    raw = str(value or "").strip().lower()
    mapping = {
        "available": "Available",
        "booked": "Booked Soon",
        "booked soon": "Booked Soon",
        "limited": "Booked Soon",
        "maintenance": "Maintenance",
        "offline": "Maintenance",
    }
    return mapping.get(raw, "Available")


def _normalize_booking_status(value: Optional[str]) -> str:
    raw = str(value or "").strip().lower()
    mapping = {
        "booked": "Booked",
        "active": "Active",
        "completed": "Completed",
        "cancelled": "Cancelled",
        "canceled": "Cancelled",
        "requested": "Booked",
    }
    return mapping.get(raw, "Booked")


def _normalize_equipment_item(item: dict) -> dict:
    normalized = dict(item)
    normalized["type"] = str(normalized.get("type") or "Equipment").strip().title()
    normalized["owner"] = _resolve_actor_name(normalized.get("owner"), "Local Provider")
    normalized["location"] = str(normalized.get("location") or "Nearby").strip()
    normalized["rent_per_day"] = int(normalized.get("rent_per_day") or 0)
    normalized["rent_per_hour"] = int(normalized.get("rent_per_hour") or max(100, round(normalized["rent_per_day"] / 6)))
    normalized["distance_km"] = float(normalized.get("distance_km") or 5)
    normalized["rating"] = float(normalized.get("rating") or 4.6)
    normalized["availability_status"] = _normalize_equipment_status(normalized.get("availability_status"))
    normalized["notes"] = str(normalized.get("notes") or "Ready for local farm work.").strip()
    normalized["available_from"] = str(normalized.get("available_from") or time.strftime("%Y-%m-%d")).strip()
    normalized["available_to"] = str(normalized.get("available_to") or "2026-03-31").strip()
    normalized["image"] = str(
        normalized.get("image")
        or "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80"
    ).strip()
    normalized["owner_email"] = str(normalized.get("owner_email") or "").strip().lower()
    normalized["owner_phone"] = _normalize_phone(normalized.get("owner_phone"))
    return normalized


def _is_admin_user(user: dict) -> bool:
    return str(user.get("user_type") or "").strip().lower() == "admin"


def _is_local_shop_or_admin(user: dict) -> bool:
    role = str(user.get("user_type") or "").strip().lower()
    return role in {"local_buyer", "admin"}


def _require_equipment_manager(user: dict):
    role = str(user.get("user_type") or "").strip().lower()
    if role not in {"equipment_owner", "admin"}:
        raise HTTPException(status_code=403, detail="Equipment owner access required")


def _can_manage_equipment(user: dict, item: dict) -> bool:
    if _is_admin_user(user):
        return True
    owner_email = str(item.get("owner_email") or "").strip().lower()
    user_email = str(user.get("email") or "").strip().lower()
    return bool(owner_email and user_email and owner_email == user_email)


def _can_manage_booking(user: dict, booking: dict) -> bool:
    if _is_admin_user(user):
        return True
    user_email = str(user.get("email") or "").strip().lower()
    return user_email in {
        str(booking.get("requester_email") or "").strip().lower(),
        str(booking.get("owner_email") or "").strip().lower(),
    }


def _booking_total(item: dict, days: int) -> int:
    return max(1, int(days)) * int(item.get("rent_per_day") or 0)


def _get_equipment_catalog():
    legacy_state = _get_state()
    fallback = legacy_state.get("equipment", list(DEFAULT_STATE["equipment"]))
    catalog = _get_equipment_scope(EQUIPMENT_CATALOG_SCOPE, fallback)
    if not isinstance(catalog, list) or not catalog:
        catalog = copy.deepcopy(fallback)

    normalized = [_normalize_equipment_item(item) for item in catalog if isinstance(item, dict)]
    if normalized != catalog:
        _save_equipment_scope(EQUIPMENT_CATALOG_SCOPE, normalized)
    return normalized


def _save_equipment_catalog(items):
    return _save_equipment_scope(EQUIPMENT_CATALOG_SCOPE, items)


def _normalize_equipment_booking(booking: dict, items_by_id: dict[int, dict]) -> dict:
    normalized = dict(booking)
    item = items_by_id.get(int(normalized.get("equipment_id") or 0))
    if item:
        normalized["equipment_name"] = item.get("name")
        normalized["owner"] = item.get("owner")
        normalized["owner_email"] = item.get("owner_email")
        normalized["owner_phone"] = item.get("owner_phone")
        normalized["location"] = item.get("location")
        normalized["rent_per_day"] = item.get("rent_per_day")
        normalized["equipment_type"] = item.get("type")

    normalized["days"] = max(1, int(normalized.get("days") or 1))
    normalized["status"] = _normalize_booking_status(normalized.get("status"))
    normalized["booking_date"] = str(normalized.get("booking_date") or time.strftime("%Y-%m-%d")).strip()
    normalized["time_slot"] = str(normalized.get("time_slot") or "08:00 AM - 12:00 PM").strip()
    normalized["created_at"] = int(normalized.get("created_at") or time.time())
    normalized["payment_method"] = str(normalized.get("payment_method") or "UPI").strip()
    normalized["total_price"] = _booking_total(item or normalized, normalized["days"])

    status = str(normalized.get("status") or "Booked").lower()
    if status == "cancelled":
        normalized["payment_status"] = "Refunded"
    elif status == "completed":
        normalized["payment_status"] = "Paid"
    else:
        normalized["payment_status"] = "Pending"

    normalized["payment_id"] = str(normalized.get("payment_id") or f"EQPAY-{int(normalized.get('id') or 0):05d}")
    return normalized


def _get_equipment_bookings(items=None):
    equipment_items = items or _get_equipment_catalog()
    items_by_id = {int(item.get("id") or 0): item for item in equipment_items}

    legacy_state = _get_state()
    fallback = legacy_state.get("equipment_bookings", [])
    bookings = _get_equipment_scope(EQUIPMENT_BOOKINGS_SCOPE, fallback)
    if not isinstance(bookings, list):
        bookings = copy.deepcopy(fallback)

    normalized = [_normalize_equipment_booking(booking, items_by_id) for booking in bookings if isinstance(booking, dict)]
    if normalized != bookings:
        _save_equipment_scope(EQUIPMENT_BOOKINGS_SCOPE, normalized)
    return normalized


def _save_equipment_bookings(bookings):
    return _save_equipment_scope(EQUIPMENT_BOOKINGS_SCOPE, bookings)


def _build_equipment_payment(booking: dict) -> dict:
    return {
        "id": str(booking.get("payment_id") or f"EQPAY-{int(booking.get('id') or 0):05d}"),
        "booking_id": int(booking.get("id") or 0),
        "equipment_id": int(booking.get("equipment_id") or 0),
        "equipment_name": booking.get("equipment_name"),
        "owner_email": booking.get("owner_email"),
        "requester_email": booking.get("requester_email"),
        "owner": booking.get("owner"),
        "requester_name": booking.get("requester_name"),
        "amount": int(booking.get("total_price") or 0),
        "status": booking.get("payment_status") or "Pending",
        "method": booking.get("payment_method") or "UPI",
        "booking_date": booking.get("booking_date"),
        "time_slot": booking.get("time_slot"),
        "location": booking.get("location") or booking.get("farmer_location"),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(booking.get("created_at") or time.time()))),
        "transaction_type": "equipment_rental",
    }


def _get_equipment_payments(bookings=None):
    normalized_bookings = bookings or _get_equipment_bookings()
    payments = _get_equipment_scope(EQUIPMENT_PAYMENTS_SCOPE, [_build_equipment_payment(booking) for booking in normalized_bookings])
    if not isinstance(payments, list):
        payments = []

    payment_by_booking = {
        int(item.get("booking_id") or 0): item
        for item in payments
        if isinstance(item, dict)
    }

    merged = []
    for booking in normalized_bookings:
        rebuilt = _build_equipment_payment(booking)
        existing = payment_by_booking.get(int(booking.get("id") or 0), {})
        rebuilt["method"] = existing.get("method") or rebuilt["method"]
        rebuilt["updated_at"] = existing.get("updated_at") or rebuilt["updated_at"]
        merged.append(rebuilt)

    if merged != payments:
        _save_equipment_scope(EQUIPMENT_PAYMENTS_SCOPE, merged)
    return merged


def _save_equipment_payments(payments):
    return _save_equipment_scope(EQUIPMENT_PAYMENTS_SCOPE, payments)


def _normalize_geocode_query(value: str) -> str:
    query = " ".join(str(value or "").strip().split())
    lowered = query.lower()
    if lowered.endswith(", india"):
        query = query[:-7].strip().rstrip(",")
    return query


def _get_cached_geocode(cache_key: str):
    now = time.time()
    cached = GEOCODE_CACHE.get(cache_key)
    if cached and (now - cached.get("ts", 0) <= GEOCODE_SUCCESS_TTL_SECONDS):
        return cached.get("coords")

    failure = GEOCODE_FAILURE_CACHE.get(cache_key)
    if failure and (now - failure <= GEOCODE_FAILURE_TTL_SECONDS):
        return "_recent_failure_"

    return None


@router.get("/geocode")
def geocode_location(
    query: str = Query(..., description="Location text to geocode"),
    country: str = Query(default="India", description="Country hint"),
):
    normalized_query = _normalize_geocode_query(query)
    if not normalized_query:
        raise HTTPException(status_code=400, detail="Query is required")

    cache_key = f"{normalized_query.lower()}::{str(country or '').strip().lower()}"
    cached_result = _get_cached_geocode(cache_key)
    if isinstance(cached_result, list):
        return {"status": "success", "data": {"coordinates": cached_result, "cached": True}}
    if cached_result == "_recent_failure_":
        return {"status": "success", "data": {"coordinates": None, "cached": True, "reason": "recent_failure"}}

    search_query = f"{normalized_query}, {country}" if country else normalized_query
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"format": "jsonv2", "limit": 1, "q": search_query},
            headers={"User-Agent": "agromind-local-services/1.0"},
            timeout=8,
        )
    except requests.RequestException:
        GEOCODE_FAILURE_CACHE[cache_key] = time.time()
        return {"status": "success", "data": {"coordinates": None, "cached": False, "reason": "network_error"}}

    if response.status_code == 429:
        GEOCODE_FAILURE_CACHE[cache_key] = time.time()
        return {"status": "success", "data": {"coordinates": None, "cached": False, "reason": "rate_limited"}}

    if response.status_code >= 400:
        GEOCODE_FAILURE_CACHE[cache_key] = time.time()
        return {"status": "success", "data": {"coordinates": None, "cached": False, "reason": "lookup_failed"}}

    rows = response.json() if response.content else []
    first = rows[0] if isinstance(rows, list) and rows else None
    if not first or not first.get("lat") or not first.get("lon"):
        GEOCODE_FAILURE_CACHE[cache_key] = time.time()
        return {"status": "success", "data": {"coordinates": None, "cached": False, "reason": "not_found"}}

    coordinates = [float(first.get("lat")), float(first.get("lon"))]
    GEOCODE_CACHE[cache_key] = {"coords": coordinates, "ts": time.time()}
    if cache_key in GEOCODE_FAILURE_CACHE:
        GEOCODE_FAILURE_CACHE.pop(cache_key, None)
    return {"status": "success", "data": {"coordinates": coordinates, "cached": False}}


@router.get("/geocode/search")
def geocode_search(
    query: str = Query(..., description="Location text for suggestions"),
    limit: int = Query(default=6, ge=1, le=10),
    addressdetails: int = Query(default=1, ge=0, le=1),
):
    normalized_query = _normalize_geocode_query(query)
    if not normalized_query:
        raise HTTPException(status_code=400, detail="Query is required")

    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "format": "jsonv2",
                "addressdetails": int(addressdetails),
                "limit": int(limit),
                "q": normalized_query,
            },
            headers={"User-Agent": "agromind-local-services/1.0"},
            timeout=8,
        )
    except requests.RequestException:
        return {"status": "success", "data": {"results": [], "reason": "network_error"}}

    if response.status_code == 429:
        return {"status": "success", "data": {"results": [], "reason": "rate_limited"}}

    if response.status_code >= 400:
        return {"status": "success", "data": {"results": [], "reason": "lookup_failed"}}

    rows = response.json() if response.content else []
    results = rows if isinstance(rows, list) else []
    return {"status": "success", "data": {"results": results}}


@router.get("/geocode/reverse")
def geocode_reverse(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    zoom: int = Query(default=16, ge=3, le=18),
    addressdetails: int = Query(default=1, ge=0, le=1),
):
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "format": "jsonv2",
                "lat": lat,
                "lon": lon,
                "zoom": int(zoom),
                "addressdetails": int(addressdetails),
            },
            headers={"User-Agent": "agromind-local-services/1.0"},
            timeout=8,
        )
    except requests.RequestException:
        return {"status": "success", "data": {"result": None, "reason": "network_error"}}

    if response.status_code == 429:
        return {"status": "success", "data": {"result": None, "reason": "rate_limited"}}

    if response.status_code >= 400:
        return {"status": "success", "data": {"result": None, "reason": "lookup_failed"}}

    payload = response.json() if response.content else None
    if not isinstance(payload, dict):
        return {"status": "success", "data": {"result": None, "reason": "not_found"}}

    return {"status": "success", "data": {"result": payload}}


def _equipment_notifications(items, bookings, user):
    user_email = str(user.get("email") or "").strip().lower()
    my_upcoming = next(
        (
            booking for booking in bookings
            if str(booking.get("requester_email") or "").strip().lower() == user_email
            and str(booking.get("status") or "").lower() not in {"cancelled", "completed"}
        ),
        None,
    )
    nearby = next(
        (item for item in items if str(item.get("availability_status") or "").lower() == "available"),
        None,
    )

    alerts = []
    if nearby:
        alerts.append({"title": "Equipment available near you", "detail": f"{nearby.get('name')} is available in {nearby.get('location')}."})
    if my_upcoming:
        alerts.append({"title": "Booking reminder", "detail": f"{my_upcoming.get('equipment_name')} is scheduled on {my_upcoming.get('booking_date')}."})
    alerts.append({"title": "Price drop alert", "detail": "Selected machines under Rs 1500/day are trending in nearby districts."})
    alerts.append({"title": "Weather alert", "detail": "Light rain expected this evening. Prefer morning field operations."})
    return alerts[:4]


def _equipment_analytics(items, bookings):
    by_type = {}
    by_location = {}
    for booking in bookings:
        booking_type = str(booking.get("equipment_type") or "Other")
        by_type[booking_type] = by_type.get(booking_type, 0) + 1
        booking_location = str(booking.get("location") or booking.get("farmer_location") or "Nearby")
        by_location[booking_location] = by_location.get(booking_location, 0) + 1

    return {
        "most_booked_equipment": sorted(by_type.items(), key=lambda item: item[1], reverse=True),
        "demand_heatmap": sorted(by_location.items(), key=lambda item: item[1], reverse=True),
        "seasonal_demand": "Kharif preparation demand rising",
        "average_booking_days": round(sum(int(item.get("days") or 1) for item in bookings) / max(len(bookings), 1), 1),
        "available_now": len([item for item in items if str(item.get("availability_status") or "").lower() == "available"]),
    }


def _require_current_user(authorization: Optional[str]) -> dict:
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
        raise HTTPException(status_code=401, detail="Invalid token subject")

    db = get_supabase_db()
    user = None

    if email:
        user = db.get_user_by_email(email)

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
    if user.get("is_active") is False:
        raise HTTPException(status_code=403, detail="User account is inactive")
    return user


def _normalize_job_status(value: str) -> str:
    status = str(value or "").strip().lower()
    mapping = {
        "pending": "Pending",
        "accepted": "Accepted",
        "in progress": "In Progress",
        "in_progress": "In Progress",
        "completed": "Completed",
    }
    normalized = mapping.get(status)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid status")
    return normalized


def _format_date_label(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parts = raw.split("-")
    if len(parts) != 3:
        return raw
    year, month, day = parts
    month_names = {
        "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
        "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
    }
    return f"{int(day)} {month_names.get(month, month)} {year}"


def _extract_weekday(value: str) -> str:
    raw = str(value or "").strip()
    if len(raw) != 10 or raw.count("-") != 2:
        return "N/A"
    year, month, day = raw.split("-")
    y = int(year)
    m = int(month)
    d = int(day)
    if m < 3:
        m += 12
        y -= 1
    k = y % 100
    j = y // 100
    h = (d + ((13 * (m + 1)) // 5) + k + (k // 4) + (j // 4) + (5 * j)) % 7
    names = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]
    return names[h]


def _is_valid_hhmm(value: str) -> bool:
    raw = str(value or "").strip()
    if len(raw) != 5 or raw[2] != ":":
        return False
    hh = raw[:2]
    mm = raw[3:]
    if not (hh.isdigit() and mm.isdigit()):
        return False
    hour = int(hh)
    minute = int(mm)
    return 0 <= hour <= 23 and 0 <= minute <= 59


def _get_worker_reminder_settings(state: dict, email: str) -> dict:
    settings_map = state.setdefault("labor_reminder_settings", {})
    current = settings_map.get(email)
    if not isinstance(current, dict):
        current = {}

    default_time = str(current.get("default_time") or "07:00").strip()
    if not _is_valid_hhmm(default_time):
        default_time = "07:00"

    auto_enabled = bool(current.get("auto_enabled", False))
    job_times_raw = current.get("job_times") if isinstance(current.get("job_times"), dict) else {}
    job_times = {
        str(k): str(v)
        for k, v in job_times_raw.items()
        if _is_valid_hhmm(str(v))
    }

    normalized = {
        "default_time": default_time,
        "auto_enabled": auto_enabled,
        "job_times": job_times,
    }
    settings_map[email] = normalized
    return normalized


def _build_weekly_analytics(completed_jobs: list) -> list:
    today = date.today()
    rows = []

    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        key = day.isoformat()
        daily_jobs = [
            job
            for job in completed_jobs
            if str(job.get("completed_date") or job.get("scheduled_date") or "") == key
        ]
        earnings = 0
        for job in daily_jobs:
            amount = int(job.get("payment_amount") or int(job.get("wage_per_day", 0)) * int(job.get("days", 1)))
            earnings += amount

        rows.append(
            {
                "date": key,
                "label": _format_date_label(key),
                "earnings": earnings,
                "jobs_completed": len(daily_jobs),
            }
        )

    return rows


def _build_payout_summary(completed_jobs: list) -> dict:
    records = []
    for job in completed_jobs:
        amount = int(job.get("payment_amount") or int(job.get("wage_per_day", 0)) * int(job.get("days", 1)))
        records.append(
            {
                "job_id": int(job.get("id", 0)),
                "date": str(job.get("completed_date") or job.get("scheduled_date") or ""),
                "work_type": str(job.get("work_type") or ""),
                "location": str(job.get("location") or ""),
                "farmer_name": str(job.get("farmer_name") or ""),
                "days": int(job.get("days") or 1),
                "amount": amount,
            }
        )

    records.sort(key=lambda item: (item.get("date") or "", int(item.get("job_id") or 0)), reverse=True)

    total_paid = sum(int(item.get("amount", 0)) for item in records)
    completed_count = len(records)
    avg_per_job = int(round(total_paid / completed_count)) if completed_count else 0
    last_payment_date = records[0].get("date") if records else ""

    return {
        "total_paid": total_paid,
        "completed_jobs": completed_count,
        "average_per_job": avg_per_job,
        "last_payment_date": last_payment_date,
        "records": records,
    }


def _build_labor_dashboard(state: dict, current_user: dict, location: str = ""):
    jobs = state.get("labor_jobs", [])
    email = str(current_user.get("email") or "").strip().lower()
    reminder_settings = _get_worker_reminder_settings(state, email)

    available_jobs = [
        job
        for job in jobs
        if str(job.get("status", "")).lower() == "pending"
        and (not location or location.lower() in str(job.get("location", "")).lower())
    ]

    my_jobs = [
        job
        for job in jobs
        if str(job.get("assigned_worker_email", "")).strip().lower() == email
    ]

    active_jobs = [
        job
        for job in my_jobs
        if str(job.get("status", "")).lower() in {"accepted", "in progress"}
    ]
    completed_jobs = [
        job
        for job in my_jobs
        if str(job.get("status", "")).lower() == "completed"
    ]

    earnings_rows = []
    for job in completed_jobs:
        amount = int(job.get("payment_amount") or int(job.get("wage_per_day", 0)) * int(job.get("days", 1)))
        date = str(job.get("completed_date") or job.get("scheduled_date") or "")
        earnings_rows.append(
            {
                "date": date,
                "date_label": _format_date_label(date),
                "job": job.get("work_type"),
                "amount": amount,
                "job_id": job.get("id"),
            }
        )

    total_earnings = sum(int(row.get("amount", 0)) for row in earnings_rows)
    weekly_earnings = sum(int(row.get("amount", 0)) for row in earnings_rows[:7])

    calendar_rows = []
    for job in sorted(my_jobs, key=lambda x: str(x.get("scheduled_date", ""))):
        date = str(job.get("scheduled_date", ""))
        calendar_rows.append(
            {
                "job_id": int(job.get("id", 0)),
                "weekday": _extract_weekday(date),
                "date": date,
                "job": job.get("work_type"),
                "status": job.get("status"),
                "location": job.get("location"),
            }
        )

    weekly_analytics = _build_weekly_analytics(completed_jobs)
    payout_summary = _build_payout_summary(completed_jobs)

    notifications = []
    for job in available_jobs[:3]:
        notifications.append(
            {
                "type": "new_job",
                "title": "New job nearby",
                "message": f"{job.get('work_type')} in {job.get('location')} at Rs{job.get('wage_per_day')}/day",
            }
        )
    if active_jobs:
        notifications.append(
            {
                "type": "job_active",
                "title": "Job accepted",
                "message": f"{active_jobs[0].get('work_type')} currently {active_jobs[0].get('status')}",
            }
        )
    if earnings_rows:
        notifications.append(
            {
                "type": "payment",
                "title": "Payment received",
                "message": f"Rs{earnings_rows[0].get('amount')} credited for {earnings_rows[0].get('job')}",
            }
        )

    return {
        "overview": {
            "available_jobs": len(available_jobs),
            "active_jobs": len(active_jobs),
            "completed_jobs": len(completed_jobs),
            "total_earnings": total_earnings,
            "weekly_earnings": weekly_earnings,
        },
        "available_jobs": available_jobs,
        "my_jobs": my_jobs,
        "calendar": calendar_rows,
        "earnings": earnings_rows,
        "job_history": completed_jobs,
        "notifications": notifications,
        "weekly_analytics": weekly_analytics,
        "payout_summary": payout_summary,
        "reminder_settings": reminder_settings,
    }


def _build_product_marketplace(state: dict, current_user: Optional[dict], location: str = "", category: str = "all"):
    products = state.get("products", [])
    normalized_location = str(location or "").strip().lower()
    normalized_category = str(category or "all").strip().lower()

    filtered = [
        item
        for item in products
        if (not normalized_location or normalized_location in str(item.get("location", "")).lower())
        and (normalized_category == "all" or normalized_category == str(item.get("category", "")).lower())
    ]

    seller_map = {}
    for item in filtered:
        key = str(item.get("seller") or "")
        if not key:
            continue
        existing = seller_map.get(key)
        if not existing:
            seller_map[key] = {
                "name": item.get("seller"),
                "location": item.get("seller_location") or item.get("location"),
                "distance_km": item.get("distance_km", 0),
                "phone": item.get("seller_phone", ""),
                "rating": item.get("rating", 0),
                "products_count": 1,
            }
        else:
            existing["products_count"] += 1
            existing["distance_km"] = min(float(existing.get("distance_km", 0)), float(item.get("distance_km", 0)))

    current_email = str((current_user or {}).get("email") or "").strip().lower()
    current_role = str((current_user or {}).get("user_type") or "").strip().lower()
    raw_orders = state.get("product_orders", [])
    cart_map = state.get("product_carts", {})
    cart_items = list(cart_map.get(current_email, [])) if current_email else []
    if current_role in {"local_buyer", "admin"}:
        if current_role == "admin":
            orders = list(raw_orders)
        else:
            orders = [
                order
                for order in raw_orders
                if str(order.get("seller_email", "")).strip().lower() == current_email
            ]
    else:
        orders = [
            order for order in raw_orders
            if not current_email or str(order.get("buyer_email", "")).strip().lower() == current_email
        ]

    statuses = ["Pending", "Packed", "Shipped", "Delivered"]
    for index, order in enumerate(orders):
        if str(order.get("status") or "").strip().lower() == "placed":
            order["status"] = statuses[index % len(statuses)]

    manager_products = filtered
    if current_role == "local_buyer" and current_email:
        manager_products = [
            item for item in filtered
            if str(item.get("seller_email", "")).strip().lower() == current_email
        ]

    low_stock_items = [item for item in manager_products if int(item.get("stock", 0)) <= 10]

    payments_history = []
    for order in orders:
        status = str(order.get("status") or "Pending").strip().title()
        payment_status = "Received" if status == "Delivered" else "Pending"
        payments_history.append({
            "order_id": order.get("id"),
            "amount": int(order.get("total", 0)),
            "mode": order.get("payment_mode", "UPI"),
            "status": payment_status,
        })

    total_earnings = sum(int(item.get("amount", 0)) for item in payments_history if item.get("status") == "Received")
    pending_payments = sum(int(item.get("amount", 0)) for item in payments_history if item.get("status") == "Pending")

    customers_map = {}
    for order in orders:
        key = str(order.get("buyer_email") or f"guest-{order.get('id')}").strip().lower()
        if not key:
            continue
        existing = customers_map.get(key)
        if not existing:
            customers_map[key] = {
                "name": order.get("buyer_name") or "Customer",
                "email": order.get("buyer_email") or "",
                "orders": 1,
                "total_spent": int(order.get("total", 0)),
            }
        else:
            existing["orders"] += 1
            existing["total_spent"] += int(order.get("total", 0))

    offers = [
        {
            "product_id": item.get("id"),
            "title": f"{item.get('offer_percent')}% off on {item.get('name')}",
            "seller": item.get("seller"),
            "location": item.get("location"),
        }
        for item in filtered
        if int(item.get("offer_percent", 0)) > 0
    ]

    recommendations = [
        "Best seeds for this season: Paddy Seed Pro aur Wheat Seed Gold demand me hain.",
        "Recommended fertilizers: Urea Boost with Organic Compost Mix for balanced soil feeding.",
        "Pest control tip: Neem Shield Spray ko evening application window me use karo.",
    ]

    notifications = []
    if offers:
        notifications.append({"id": "offer-1", "message": offers[0]["title"]})
    if orders:
        notifications.append({"id": f"order-{orders[0].get('id')}", "message": f"Order #{orders[0].get('id')} is {orders[0].get('status')}"})
    if filtered:
        notifications.append({"id": "stock-1", "message": f"{filtered[0].get('name')} available near {filtered[0].get('location')}"})

    categories = [
        {"id": "all", "label": "All Products", "count": len(products)},
        {"id": "Seeds", "label": "Seeds", "count": len([item for item in products if item.get("category") == "Seeds"])},
        {"id": "Fertilizers", "label": "Fertilizers", "count": len([item for item in products if item.get("category") == "Fertilizers"])},
        {"id": "Pesticides", "label": "Pesticides", "count": len([item for item in products if item.get("category") == "Pesticides"])},
        {"id": "Farming Tools", "label": "Farming Tools", "count": len([item for item in products if item.get("category") == "Farming Tools"])},
        {"id": "Crop Produce", "label": "Crop Produce", "count": len([item for item in products if item.get("category") == "Crop Produce"])},
    ]

    return {
        "summary": {
            "available_products": len(filtered),
            "nearby_sellers": len(seller_map),
            "active_orders": len([item for item in orders if str(item.get("status", "")).lower() != "delivered"]),
            "offers": len(offers),
        },
        "categories": categories,
        "products": filtered,
        "orders": orders,
        "cart": cart_items,
        "sellers": sorted(seller_map.values(), key=lambda item: float(item.get("distance_km", 0))),
        "offers": offers,
        "recommendations": recommendations,
        "notifications": notifications,
        "manager": {
            "products": manager_products,
            "orders": orders,
            "low_stock_items": low_stock_items,
            "payments": {
                "total_earnings": total_earnings,
                "pending_payments": pending_payments,
                "history": payments_history,
            },
            "customers": sorted(customers_map.values(), key=lambda item: item.get("total_spent", 0), reverse=True),
        },
    }


def _build_cart_item(product: dict, quantity: int) -> dict:
    qty = max(1, int(quantity))
    unit_price = int(product.get("price", 0))
    return {
        "id": int(product.get("id", 0)),
        "product_id": int(product.get("id", 0)),
        "name": product.get("name"),
        "seller": product.get("seller"),
        "category": product.get("category"),
        "unit": product.get("unit"),
        "price": unit_price,
        "quantity": qty,
        "line_total": unit_price * qty,
    }


@router.get("/workers")
def list_workers(
    location: str = Query(default="", description="Filter by location"),
    skill: str = Query(default="all", description="Filter by skill"),
):
    state = _get_state()
    workers = state.get("workers", [])

    filtered = [
        item
        for item in workers
        if (not location or location.lower() in str(item.get("location", "")).lower())
        and (skill == "all" or skill.lower() in str(item.get("skill", "")).lower())
    ]

    return {
        "status": "success",
        "data": {
            "workers": filtered,
            "bookings": state.get("worker_bookings", []),
        },
    }


@router.post("/workers/book")
def book_worker(payload: WorkerBookingPayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    workers = state.get("workers", [])
    worker = next((item for item in workers if int(item.get("id", 0)) == int(payload.worker_id)), None)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    booking = {
        "id": max([item.get("id", 0) for item in state.get("worker_bookings", [])] + [0]) + 1,
        "worker_id": worker.get("id"),
        "worker_name": worker.get("name"),
        "skill": worker.get("skill"),
        "location": worker.get("location"),
        "rate_per_day": worker.get("rate_per_day"),
        "days": max(1, int(payload.days)),
        "requester_name": _resolve_actor_name(current_user.get("name"), "Farmer"),
        "requester_email": current_user.get("email"),
        "status": "Requested",
    }
    state["worker_bookings"].insert(0, booking)
    _save_state(state)

    return {"status": "success", "data": booking}


@router.get("/equipment")
def list_equipment(
    location: str = Query(default="", description="Filter by location"),
    equipment_type: str = Query(default="all", description="Filter by equipment type"),
):
    items = _get_equipment_catalog()
    bookings = _get_equipment_bookings(items)

    filtered = [
        item
        for item in items
        if (not location or location.lower() in str(item.get("location", "")).lower())
        and (
            equipment_type == "all"
            or equipment_type.lower() == str(item.get("type", "")).lower()
        )
    ]

    return {
        "status": "success",
        "data": {
            "equipment": filtered,
            "bookings": bookings,
        },
    }


@router.get("/equipment/dashboard")
def get_equipment_dashboard(
    location: str = Query(default="", description="Filter by location"),
    equipment_type: str = Query(default="all", description="Filter by equipment type"),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    user_email = str(current_user.get("email") or "").strip().lower()

    items = _get_equipment_catalog()
    bookings = _get_equipment_bookings(items)
    payments = _get_equipment_payments(bookings)

    filtered_items = [
        item
        for item in items
        if (not location or location.lower() in str(item.get("location", "")).lower())
        and (
            equipment_type == "all"
            or equipment_type.lower() == str(item.get("type", "")).lower()
        )
    ]

    is_owner = role in {"equipment_owner", "admin"}
    my_listings = items if role == "admin" else [item for item in items if str(item.get("owner_email") or "").strip().lower() == user_email]

    if is_owner:
        my_bookings = bookings if role == "admin" else [booking for booking in bookings if str(booking.get("owner_email") or "").strip().lower() == user_email]
        my_payments = payments if role == "admin" else [payment for payment in payments if str(payment.get("owner_email") or "").strip().lower() == user_email]
    else:
        my_bookings = [booking for booking in bookings if str(booking.get("requester_email") or "").strip().lower() == user_email]
        my_payments = [payment for payment in payments if str(payment.get("requester_email") or "").strip().lower() == user_email]

    return {
        "status": "success",
        "data": {
            "equipment": filtered_items,
            "all_equipment": items,
            "my_listings": my_listings,
            "my_bookings": my_bookings,
            "payments": my_payments,
            "notifications": _equipment_notifications(filtered_items or items, my_bookings, current_user),
            "analytics": _equipment_analytics(items, bookings),
        },
    }


@router.post("/equipment")
def create_equipment(payload: EquipmentCreatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    _require_equipment_manager(current_user)
    items = _get_equipment_catalog()

    item = _normalize_equipment_item(
        {
            "id": max([entry.get("id", 0) for entry in items] + [0]) + 1,
            "name": payload.name,
            "type": payload.type,
            "location": payload.location,
            "rent_per_day": max(1, int(payload.rent_per_day)),
            "rent_per_hour": payload.rent_per_hour,
            "image": payload.image,
            "distance_km": payload.distance_km or 1,
            "rating": payload.rating or 4.8,
            "availability_status": payload.availability_status or "Available",
            "notes": payload.notes,
            "available_from": payload.available_from,
            "available_to": payload.available_to,
            "owner": _resolve_actor_name(current_user.get("name"), "Equipment Owner"),
            "owner_email": current_user.get("email"),
            "owner_phone": current_user.get("phone"),
        }
    )

    items.insert(0, item)
    _save_equipment_catalog(items)
    return {"status": "success", "data": item}


@router.patch("/equipment/{equipment_id}")
def update_equipment(equipment_id: int, payload: EquipmentUpdatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    items = _get_equipment_catalog()
    index = next((idx for idx, entry in enumerate(items) if int(entry.get("id", 0)) == int(equipment_id)), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    existing = _normalize_equipment_item(items[index])
    if not _can_manage_equipment(current_user, existing):
        raise HTTPException(status_code=403, detail="You cannot edit this equipment")

    updates = payload.model_dump(exclude_none=True)
    merged = dict(existing)
    merged.update(updates)
    merged["id"] = existing.get("id")
    merged["owner"] = existing.get("owner")
    merged["owner_email"] = existing.get("owner_email")
    merged["owner_phone"] = existing.get("owner_phone")
    normalized = _normalize_equipment_item(merged)
    items[index] = normalized
    _save_equipment_catalog(items)

    return {"status": "success", "data": normalized}


@router.delete("/equipment/{equipment_id}")
def delete_equipment(equipment_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    items = _get_equipment_catalog()
    index = next((idx for idx, entry in enumerate(items) if int(entry.get("id", 0)) == int(equipment_id)), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    existing = _normalize_equipment_item(items[index])
    if not _can_manage_equipment(current_user, existing):
        raise HTTPException(status_code=403, detail="You cannot delete this equipment")

    removed = items.pop(index)
    _save_equipment_catalog(items)
    return {"status": "success", "data": {"deleted_id": equipment_id, "name": removed.get("name")}}


@router.post("/equipment/book")
def book_equipment(payload: EquipmentBookingPayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    items = _get_equipment_catalog()
    bookings = _get_equipment_bookings(items)
    item = next((entry for entry in items if int(entry.get("id", 0)) == int(payload.equipment_id)), None)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")

    item = _normalize_equipment_item(item)
    if item.get("availability_status") == "Maintenance":
        raise HTTPException(status_code=400, detail="Equipment is under maintenance")

    booking = {
        "id": max([entry.get("id", 0) for entry in bookings] + [0]) + 1,
        "equipment_id": item.get("id"),
        "equipment_name": item.get("name"),
        "owner": item.get("owner"),
        "owner_email": item.get("owner_email"),
        "owner_phone": item.get("owner_phone"),
        "location": item.get("location"),
        "rent_per_day": item.get("rent_per_day"),
        "days": max(1, int(payload.days)),
        "booking_date": payload.booking_date or time.strftime("%Y-%m-%d"),
        "time_slot": payload.time_slot or "08:00 AM - 12:00 PM",
        "farmer_location": payload.location or current_user.get("location") or item.get("location"),
        "requester_name": _resolve_actor_name(current_user.get("name"), "Farmer"),
        "requester_email": current_user.get("email"),
        "requester_phone": current_user.get("phone") or "",
        "status": "Booked",
        "payment_status": "Pending",
        "total_price": _booking_total(item, max(1, int(payload.days))),
        "created_at": int(time.time()),
        "payment_method": payload.payment_method or "UPI",
    }
    bookings.insert(0, _normalize_equipment_booking(booking, {int(entry.get("id") or 0): entry for entry in items}))
    _save_equipment_bookings(bookings)
    _save_equipment_payments(_get_equipment_payments(bookings))

    return {"status": "success", "data": booking}


@router.patch("/equipment/bookings/{booking_id}")
def update_equipment_booking(booking_id: int, payload: EquipmentBookingUpdatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    items = _get_equipment_catalog()
    items_by_id = {int(item.get("id") or 0): item for item in items}
    bookings = _get_equipment_bookings(items)
    index = next((idx for idx, entry in enumerate(bookings) if int(entry.get("id", 0)) == int(booking_id)), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking = dict(bookings[index])
    if not _can_manage_booking(current_user, booking):
        raise HTTPException(status_code=403, detail="You cannot update this booking")

    if payload.days is not None:
        booking["days"] = max(1, int(payload.days))

    if payload.status is not None:
        booking["status"] = _normalize_booking_status(payload.status)

    item = items_by_id.get(int(booking.get("equipment_id", 0)))
    if item:
        normalized_item = _normalize_equipment_item(item)
        booking["rent_per_day"] = normalized_item.get("rent_per_day")
        booking["total_price"] = _booking_total(normalized_item, booking.get("days") or 1)

    status = str(booking.get("status") or "Booked").lower()
    if status == "cancelled":
        booking["payment_status"] = "Refunded"
    elif status == "completed":
        booking["payment_status"] = "Paid"
    else:
        booking["payment_status"] = "Pending"

    bookings[index] = _normalize_equipment_booking(booking, items_by_id)
    _save_equipment_bookings(bookings)
    _save_equipment_payments(_get_equipment_payments(bookings))
    return {"status": "success", "data": bookings[index]}


@router.patch("/equipment/payments/{payment_id}")
def update_equipment_payment(payment_id: str, payload: EquipmentPaymentUpdatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    user_email = str(current_user.get("email") or "").strip().lower()

    payments = _get_equipment_payments()
    index = next((idx for idx, p in enumerate(payments) if str(p.get("id") or "") == str(payment_id)), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    payment = dict(payments[index])
    owner_email = str(payment.get("owner_email") or "").strip().lower()
    if not _is_admin_user(current_user) and owner_email != user_email:
        raise HTTPException(status_code=403, detail="You cannot update this payment")

    if payload.method is not None:
        allowed_methods = {"UPI", "Bank Transfer", "Cash", "Wallet"}
        if payload.method not in allowed_methods:
            raise HTTPException(status_code=400, detail=f"Invalid method. Allowed: {', '.join(sorted(allowed_methods))}")
        payment["method"] = payload.method

    if payload.status is not None:
        allowed_statuses = {"Paid", "Pending", "Refunded"}
        if payload.status not in allowed_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {', '.join(sorted(allowed_statuses))}")
        payment["status"] = payload.status
        payment["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    payments[index] = payment
    _save_equipment_payments(payments)
    return {"status": "success", "data": payment}


@router.get("/products")
def list_products(
    location: str = Query(default="", description="Filter by location"),
    category: str = Query(default="all", description="Filter by category"),
    authorization: Optional[str] = Header(default=None),
):
    state = _get_state()
    current_user = None
    if authorization:
        try:
            current_user = _require_current_user(authorization)
        except HTTPException:
            current_user = None

    marketplace = _build_product_marketplace(state, current_user, location, category)

    return {
        "status": "success",
        "data": marketplace,
    }


@router.post("/products/cart")
def add_product_to_cart(payload: ProductCartPayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    products = state.get("products", [])
    product = next((item for item in products if int(item.get("id", 0)) == int(payload.product_id)), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    email = str(current_user.get("email") or "").strip().lower()
    carts = state.setdefault("product_carts", {})
    cart = list(carts.get(email, []))
    quantity = max(1, int(payload.quantity))

    existing = next((item for item in cart if int(item.get("product_id", 0)) == int(payload.product_id)), None)
    if existing:
        existing["quantity"] = int(existing.get("quantity", 0)) + quantity
        existing["line_total"] = int(existing.get("price", 0)) * int(existing.get("quantity", 0))
    else:
        cart.append(_build_cart_item(product, quantity))

    carts[email] = cart
    _save_state(state)
    return {"status": "success", "data": _build_product_marketplace(state, current_user)}


@router.patch("/products/cart/{product_id}")
def update_product_cart_item(product_id: int, payload: ProductCartPayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    email = str(current_user.get("email") or "").strip().lower()
    carts = state.setdefault("product_carts", {})
    cart = list(carts.get(email, []))
    item = next((entry for entry in cart if int(entry.get("product_id", 0)) == int(product_id)), None)
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    item["quantity"] = max(1, int(payload.quantity))
    item["line_total"] = int(item.get("price", 0)) * int(item.get("quantity", 0))
    carts[email] = cart
    _save_state(state)
    return {"status": "success", "data": _build_product_marketplace(state, current_user)}


@router.delete("/products/cart/{product_id}")
def remove_product_cart_item(product_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    email = str(current_user.get("email") or "").strip().lower()
    carts = state.setdefault("product_carts", {})
    cart = [entry for entry in carts.get(email, []) if int(entry.get("product_id", 0)) != int(product_id)]
    carts[email] = cart
    _save_state(state)
    return {"status": "success", "data": _build_product_marketplace(state, current_user)}


@router.post("/products/cart/checkout")
def checkout_product_cart(authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    email = str(current_user.get("email") or "").strip().lower()
    carts = state.setdefault("product_carts", {})
    cart = list(carts.get(email, []))
    if not cart:
        raise HTTPException(status_code=400, detail="Cart is empty")

    products = state.get("products", [])
    orders = state.get("product_orders", [])
    next_order_id = max([item.get("id", 0) for item in orders] + [0]) + 1

    for cart_item in cart:
        product = next((item for item in products if int(item.get("id", 0)) == int(cart_item.get("product_id", 0))), None)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {cart_item.get('name')} not found")
        quantity = max(1, int(cart_item.get("quantity", 0)))
        stock = int(product.get("stock", 0))
        if stock < quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.get('name')}")

    for cart_item in cart:
        product = next((item for item in products if int(item.get("id", 0)) == int(cart_item.get("product_id", 0))), None)
        quantity = max(1, int(cart_item.get("quantity", 0)))
        product["stock"] = int(product.get("stock", 0)) - quantity
        orders.insert(0, {
            "id": next_order_id,
            "product_id": product.get("id"),
            "product_name": product.get("name"),
            "category": product.get("category"),
            "seller": product.get("seller"),
            "seller_email": product.get("seller_email", ""),
            "price": int(product.get("price", 0)),
            "quantity": quantity,
            "buyer_name": _resolve_actor_name(current_user.get("name"), "Crop Shop"),
            "buyer_email": current_user.get("email"),
            "location": product.get("location"),
            "status": "Pending",
            "payment_mode": "UPI",
            "total": int(product.get("price", 0)) * quantity,
        })
        next_order_id += 1

    carts[email] = []
    _save_state(state)
    return {"status": "success", "message": "Cart checkout complete", "data": _build_product_marketplace(state, current_user)}


@router.post("/products/buy")
def buy_product(payload: ProductPurchasePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    products = state.get("products", [])
    product = next((item for item in products if int(item.get("id", 0)) == int(payload.product_id)), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    quantity = max(1, int(payload.quantity))
    stock = int(product.get("stock", 0))
    if stock < quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    product["stock"] = stock - quantity
    order = {
        "id": max([item.get("id", 0) for item in state.get("product_orders", [])] + [0]) + 1,
        "product_id": product.get("id"),
        "product_name": product.get("name"),
        "category": product.get("category"),
        "seller": product.get("seller"),
        "seller_email": product.get("seller_email", ""),
        "price": int(product.get("price", 0)),
        "quantity": quantity,
        "buyer_name": _resolve_actor_name(current_user.get("name"), "Crop Shop"),
        "buyer_email": current_user.get("email"),
        "location": product.get("location"),
        "status": "Pending",
        "payment_mode": "UPI",
        "total": int(product.get("price", 0)) * quantity,
    }
    state["product_orders"].insert(0, order)
    _save_state(state)

    return {"status": "success", "data": order}


@router.post("/products/manage")
def create_product(payload: ProductManageCreatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    if not _is_local_shop_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Local shop/admin access required")

    state = _get_state()
    products = state.get("products", [])
    next_id = max([int(item.get("id", 0)) for item in products] + [0]) + 1

    item = {
        "id": next_id,
        "name": str(payload.name).strip(),
        "category": str(payload.category).strip() or "Crop Produce",
        "seller": _resolve_actor_name(current_user.get("name"), "Local Shop"),
        "seller_email": str(current_user.get("email") or "").strip().lower(),
        "seller_phone": str(current_user.get("phone") or "").strip(),
        "seller_location": str(payload.location or current_user.get("location") or "Nearby").strip(),
        "location": str(payload.location or current_user.get("location") or "Nearby").strip(),
        "distance_km": 1,
        "price": max(1, int(payload.price)),
        "unit": str(payload.unit or "kg").strip(),
        "stock": max(0, int(payload.quantity or 0)),
        "image": str(payload.image or "").strip(),
        "description": str(payload.description or "").strip(),
        "offer_percent": 0,
        "rating": 4.6,
    }
    if not item["image"]:
        item["image"] = "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80"

    products.insert(0, item)
    state["products"] = products
    _save_state(state)
    return {"status": "success", "data": item}


@router.patch("/products/manage/{product_id}")
def update_product(product_id: int, payload: ProductManageUpdatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    if not _is_local_shop_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Local shop/admin access required")

    state = _get_state()
    products = state.get("products", [])
    product = next((item for item in products if int(item.get("id", 0)) == int(product_id)), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    owner_email = str(product.get("seller_email") or "").strip().lower()
    user_email = str(current_user.get("email") or "").strip().lower()
    if not _is_admin_user(current_user) and owner_email and owner_email != user_email:
        raise HTTPException(status_code=403, detail="You cannot edit this product")

    if payload.name is not None:
        product["name"] = str(payload.name).strip() or product.get("name")
    if payload.category is not None:
        product["category"] = str(payload.category).strip() or product.get("category")
    if payload.price is not None:
        product["price"] = max(1, int(payload.price))
    if payload.quantity is not None:
        product["stock"] = max(0, int(payload.quantity))
    if payload.unit is not None:
        product["unit"] = str(payload.unit).strip() or product.get("unit")
    if payload.image is not None:
        product["image"] = str(payload.image).strip() or product.get("image")
    if payload.description is not None:
        product["description"] = str(payload.description).strip()
    if payload.location is not None:
        product["location"] = str(payload.location).strip() or product.get("location")
        product["seller_location"] = product["location"]

    _save_state(state)
    return {"status": "success", "data": product}


@router.delete("/products/manage/{product_id}")
def delete_product(product_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    if not _is_local_shop_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Local shop/admin access required")

    state = _get_state()
    products = state.get("products", [])
    product = next((item for item in products if int(item.get("id", 0)) == int(product_id)), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    owner_email = str(product.get("seller_email") or "").strip().lower()
    user_email = str(current_user.get("email") or "").strip().lower()
    if not _is_admin_user(current_user) and owner_email and owner_email != user_email:
        raise HTTPException(status_code=403, detail="You cannot delete this product")

    state["products"] = [item for item in products if int(item.get("id", 0)) != int(product_id)]
    _save_state(state)
    return {"status": "success", "message": "Product deleted"}


@router.patch("/products/orders/{order_id}/status")
def update_product_order_status(order_id: int, payload: ProductOrderStatusPayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    if not _is_local_shop_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Local shop/admin access required")

    allowed_status = {"Pending", "Packed", "Shipped", "Delivered"}
    next_status = str(payload.status or "").strip().title()
    if next_status not in allowed_status:
        raise HTTPException(status_code=400, detail="Invalid status")

    state = _get_state()
    orders = state.get("product_orders", [])
    order = next((item for item in orders if int(item.get("id", 0)) == int(order_id)), None)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    owner_email = str(order.get("seller_email") or "").strip().lower()
    user_email = str(current_user.get("email") or "").strip().lower()
    if not _is_admin_user(current_user) and owner_email and owner_email != user_email:
        raise HTTPException(status_code=403, detail="You cannot update this order")

    order["status"] = next_status
    _save_state(state)
    return {"status": "success", "data": order}


@router.get("/labor/dashboard")
def get_labor_dashboard(
    location: str = Query(default="", description="Filter nearby available jobs by location"),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_current_user(authorization)
    state = _get_state()
    dashboard = _build_labor_dashboard(state, current_user, location)
    return {"status": "success", "data": dashboard}


@router.post("/labor/jobs")
def create_labor_job(payload: LaborJobCreatePayload, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"farmer", "admin"}:
        raise HTTPException(status_code=403, detail="Only farmer/admin can post labor jobs")

    state = _get_state()
    jobs = state.get("labor_jobs", [])
    next_id = max([int(job.get("id", 0)) for job in jobs] + [200]) + 1

    job = {
        "id": next_id,
        "farmer_name": _resolve_actor_name(current_user.get("name"), "Farmer"),
        "farmer_email": current_user.get("email"),
        "farmer_phone": _normalize_phone(current_user.get("phone")),
        "work_type": str(payload.work_type).strip() or "Harvesting",
        "location": str(payload.location).strip() or "Unknown",
        "wage_per_day": max(1, int(payload.wage_per_day)),
        "scheduled_date": str(payload.scheduled_date or ""),
        "days": max(1, int(payload.days)),
        "notes": str(payload.notes or "").strip(),
        "status": "Pending",
        "assigned_worker_name": "",
        "assigned_worker_email": "",
        "assigned_worker_phone": "",
        "events": [
            {
                "type": "created",
                "actor": _resolve_actor_name(current_user.get("name"), "Farmer"),
                "timestamp": int(time.time()),
                "message": "Job posted by farmer",
            }
        ],
    }
    jobs.insert(0, job)
    _save_state(state)
    return {"status": "success", "data": job}


@router.post("/labor/jobs/{job_id}/accept")
def accept_labor_job(job_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"worker", "admin"}:
        raise HTTPException(status_code=403, detail="Only worker/admin can accept labor jobs")

    state = _get_state()
    jobs = state.get("labor_jobs", [])
    job = next((item for item in jobs if int(item.get("id", 0)) == int(job_id)), None)
    if not job:
        raise HTTPException(status_code=404, detail="Labor job not found")
    if str(job.get("status", "")).lower() != "pending":
        raise HTTPException(status_code=400, detail="Job is not available for acceptance")

    worker_name = _resolve_actor_name(current_user.get("name"), "Worker")
    job["assigned_worker_name"] = worker_name
    job["assigned_worker_email"] = current_user.get("email")
    job["assigned_worker_phone"] = _normalize_phone(current_user.get("phone"))
    job["status"] = "Accepted"
    job.setdefault("events", []).append({
        "type": "accepted",
        "actor": worker_name,
        "timestamp": int(time.time()),
        "message": f"{worker_name} accepted this job",
    })
    _save_state(state)
    return {"status": "success", "data": job}


@router.get("/labor/my-posted")
def get_my_posted_labor_jobs(authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"farmer", "admin"}:
        raise HTTPException(status_code=403, detail="Only farmer/admin can access posted labor jobs")

    state = _get_state()
    jobs = state.get("labor_jobs", [])
    email = str(current_user.get("email") or "").strip().lower()
    if role == "admin":
        posted = list(jobs)
    else:
        posted = [
            item
            for item in jobs
            if str(item.get("farmer_email") or "").strip().lower() == email
        ]

    posted_sorted = sorted(posted, key=lambda item: int(item.get("id", 0)), reverse=True)
    return {"status": "success", "data": {"jobs": posted_sorted}}


@router.get("/labor/jobs/{job_id}/messages")
def get_labor_job_messages(job_id: int, authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    state = _get_state()
    jobs = state.get("labor_jobs", [])
    job = next((item for item in jobs if int(item.get("id", 0)) == int(job_id)), None)
    if not job:
        raise HTTPException(status_code=404, detail="Labor job not found")

    email = str(current_user.get("email") or "").strip().lower()
    farmer_email = str(job.get("farmer_email") or "").strip().lower()
    worker_email = str(job.get("assigned_worker_email") or "").strip().lower()
    role = str(current_user.get("user_type") or "").strip().lower()
    if role != "admin" and email not in {farmer_email, worker_email}:
        raise HTTPException(status_code=403, detail="Access denied")

    messages = state.get("job_messages", {}).get(str(job_id), [])
    events = job.get("events", [])
    return {"status": "success", "data": {"messages": messages, "events": events}}


@router.get("/labor/reminder-settings")
def get_labor_reminder_settings(authorization: Optional[str] = Header(default=None)):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"worker", "admin"}:
        raise HTTPException(status_code=403, detail="Only worker/admin can access reminder settings")

    state = _get_state()
    email = str(current_user.get("email") or "").strip().lower()
    settings = _get_worker_reminder_settings(state, email)
    _save_state(state)
    return {"status": "success", "data": settings}


@router.put("/labor/reminder-settings")
def update_labor_reminder_settings(
    payload: LaborReminderSettingsPayload,
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"worker", "admin"}:
        raise HTTPException(status_code=403, detail="Only worker/admin can update reminder settings")

    state = _get_state()
    email = str(current_user.get("email") or "").strip().lower()
    current = _get_worker_reminder_settings(state, email)

    if payload.default_time is not None:
        time_value = str(payload.default_time).strip()
        if not _is_valid_hhmm(time_value):
            raise HTTPException(status_code=400, detail="default_time must be in HH:MM format")
        current["default_time"] = time_value

    if payload.auto_enabled is not None:
        current["auto_enabled"] = bool(payload.auto_enabled)

    if payload.job_times is not None:
        if not isinstance(payload.job_times, dict):
            raise HTTPException(status_code=400, detail="job_times must be a dictionary")
        cleaned = {}
        for key, value in payload.job_times.items():
            job_id = str(key).strip()
            if not job_id:
                continue
            t = str(value).strip()
            if _is_valid_hhmm(t):
                cleaned[job_id] = t
        current["job_times"] = cleaned

    state.setdefault("labor_reminder_settings", {})[email] = current
    _save_state(state)
    return {"status": "success", "data": current}


@router.get("/labor/payout-summary")
def get_labor_payout_summary(
    format: str = Query(default="json", description="json or csv"),
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"worker", "admin"}:
        raise HTTPException(status_code=403, detail="Only worker/admin can access payout summary")

    state = _get_state()
    email = str(current_user.get("email") or "").strip().lower()
    jobs = state.get("labor_jobs", [])
    completed_jobs = [
        job
        for job in jobs
        if str(job.get("assigned_worker_email") or "").strip().lower() == email
        and str(job.get("status") or "").strip().lower() == "completed"
    ]

    summary = _build_payout_summary(completed_jobs)
    if str(format).strip().lower() != "csv":
        return {"status": "success", "data": summary}

    lines = ["job_id,date,work_type,location,farmer_name,days,amount"]
    for row in summary.get("records", []):
        cols = [
            str(row.get("job_id", "")),
            str(row.get("date", "")),
            str(row.get("work_type", "")).replace(",", " "),
            str(row.get("location", "")).replace(",", " "),
            str(row.get("farmer_name", "")).replace(",", " "),
            str(row.get("days", "")),
            str(row.get("amount", "")),
        ]
        lines.append(",".join(cols))

    csv_data = "\n".join(lines)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=worker-payout-summary.csv"},
    )


@router.post("/labor/jobs/{job_id}/messages")
def send_labor_job_message(
    job_id: int,
    payload: LaborMessagePayload,
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_current_user(authorization)
    state = _get_state()
    jobs = state.get("labor_jobs", [])
    job = next((item for item in jobs if int(item.get("id", 0)) == int(job_id)), None)
    if not job:
        raise HTTPException(status_code=404, detail="Labor job not found")

    email = str(current_user.get("email") or "").strip().lower()
    farmer_email = str(job.get("farmer_email") or "").strip().lower()
    worker_email = str(job.get("assigned_worker_email") or "").strip().lower()
    role = str(current_user.get("user_type") or "").strip().lower()
    if role != "admin" and email not in {farmer_email, worker_email}:
        raise HTTPException(status_code=403, detail="Only farmer or assigned worker can message on this job")

    text = str(payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")

    msg = {
        "id": int(time.time() * 1000),
        "job_id": job_id,
        "sender_email": email,
        "sender_name": _resolve_actor_name(current_user.get("name"), current_user.get("user_type", "user").capitalize()),
        "sender_role": current_user.get("user_type", ""),
        "text": text,
        "timestamp": int(time.time()),
    }
    msgs = state.setdefault("job_messages", {})
    msgs.setdefault(str(job_id), []).append(msg)
    _save_state(state)
    return {"status": "success", "data": msg}


@router.patch("/labor/jobs/{job_id}/status")
def update_labor_job_status(
    job_id: int,
    payload: LaborJobStatusPayload,
    authorization: Optional[str] = Header(default=None),
):
    current_user = _require_current_user(authorization)
    role = str(current_user.get("user_type") or "").strip().lower()
    if role not in {"worker", "admin"}:
        raise HTTPException(status_code=403, detail="Only worker/admin can update labor job status")

    state = _get_state()
    jobs = state.get("labor_jobs", [])
    job = next((item for item in jobs if int(item.get("id", 0)) == int(job_id)), None)
    if not job:
        raise HTTPException(status_code=404, detail="Labor job not found")

    email = str(current_user.get("email") or "").strip().lower()
    assigned_email = str(job.get("assigned_worker_email") or "").strip().lower()
    if role != "admin" and assigned_email and assigned_email != email:
        raise HTTPException(status_code=403, detail="Cannot update another worker's job")

    status = _normalize_job_status(payload.status)
    actor_name = _resolve_actor_name(current_user.get("name"), "Worker")
    job["status"] = status
    if status == "In Progress":
        job.setdefault("events", []).append({
            "type": "started",
            "actor": actor_name,
            "timestamp": int(time.time()),
            "message": f"{actor_name} started work",
        })
    if status == "Completed":
        amount = int(job.get("wage_per_day", 0)) * max(1, int(job.get("days", 1)))
        job["payment_amount"] = amount
        if not str(job.get("completed_date") or ""):
            job["completed_date"] = str(job.get("scheduled_date") or "")
        job.setdefault("events", []).append({
            "type": "completed",
            "actor": actor_name,
            "timestamp": int(time.time()),
            "message": f"Job completed — payment Rs{amount} due",
        })

    _save_state(state)
    return {"status": "success", "data": job}
