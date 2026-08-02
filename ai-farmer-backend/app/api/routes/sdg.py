from typing import Optional

from fastapi import APIRouter, Query

from app.services.supabase_state_store import get_dashboard_state_store

router = APIRouter()
state_store = get_dashboard_state_store()


def _clamp(value: float, low: float, high: float) -> int:
    return int(max(low, min(high, round(value))))


def _safe_int(value, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _default_transport_state():
    return {
        "available_bookings": [],
        "my_bookings": [],
        "vehicle": {},
    }


def _default_store_state():
    return {
        "inventory": [],
        "sales": [],
        "suppliers": [],
    }


def _default_buyer_state():
    return {
        "products": [],
        "orders": [],
        "favorites": [],
        "cart": [],
    }


def _compute_metrics():
    transport = state_store.get_state("transport_dashboard", _default_transport_state())
    store = state_store.get_state("store_dashboard", _default_store_state())
    buyer = state_store.get_state("buyer_dashboard", _default_buyer_state())

    my_bookings = transport.get("my_bookings", [])
    available_bookings = transport.get("available_bookings", [])
    vehicle = transport.get("vehicle", {})

    delivered = len([item for item in my_bookings if str(item.get("status", "")).lower() == "delivered"])
    in_transit = len([item for item in my_bookings if str(item.get("status", "")).lower() == "in transit"])
    assigned = len([item for item in my_bookings if str(item.get("status", "")).lower() == "assigned"])

    inventory = store.get("inventory", [])
    sales = store.get("sales", [])
    low_stock = len([item for item in inventory if str(item.get("status", "")).lower() == "low stock"])
    completed_sales = len([item for item in sales if str(item.get("status", "")).lower() == "completed"])

    orders = buyer.get("orders", [])
    delivered_orders = len([item for item in orders if str(item.get("status", "")).lower() == "delivered"])
    in_progress_orders = len(
        [
            item
            for item in orders
            if str(item.get("status", "")).lower() not in {"delivered", "cancelled"}
        ]
    )

    economic_value = sum(_safe_int(item.get("price", 0)) for item in my_bookings) + sum(
        _safe_int(item.get("amount", 0)) for item in sales
    )

    return {
        "transport": {
            "delivered": delivered,
            "in_transit": in_transit,
            "assigned": assigned,
            "open_jobs": len(available_bookings),
            "vehicle_active": str(vehicle.get("status", "")).lower() in {"active", "in service"},
        },
        "storage": {
            "inventory_items": len(inventory),
            "low_stock_items": low_stock,
            "completed_sales": completed_sales,
        },
        "buyer": {
            "orders_total": len(orders),
            "orders_delivered": delivered_orders,
            "orders_in_progress": in_progress_orders,
        },
        "economic_value": economic_value,
    }


def _build_scores(metrics: dict):
    transport = metrics.get("transport", {})
    storage = metrics.get("storage", {})
    buyer = metrics.get("buyer", {})
    economic_value = metrics.get("economic_value", 0)

    score_sdg2 = _clamp(
        55
        + transport.get("delivered", 0) * 4
        + storage.get("completed_sales", 0) * 3
        - storage.get("low_stock_items", 0),
        45,
        96,
    )

    score_sdg8 = _clamp(
        52 + (economic_value / 100000) * 4 + buyer.get("orders_delivered", 0) * 3,
        42,
        96,
    )

    score_sdg12 = _clamp(
        50
        + storage.get("inventory_items", 0) * 2
        + storage.get("completed_sales", 0) * 2
        - storage.get("low_stock_items", 0) * 2,
        40,
        94,
    )

    score_sdg13 = _clamp(
        48
        + transport.get("in_transit", 0) * 2
        + transport.get("vehicle_active", False) * 8
        + max(0, 10 - transport.get("open_jobs", 0)),
        38,
        93,
    )

    score_sdg15 = _clamp(
        54
        + buyer.get("orders_total", 0) * 2
        + transport.get("delivered", 0) * 2
        - storage.get("low_stock_items", 0),
        42,
        95,
    )

    goals = [
        {
            "id": "sdg2",
            "number": 2,
            "title": "Zero Hunger",
            "theme": "Food Security & Productivity",
            "score": score_sdg2,
            "highlights": [
                f"Delivered loads: {transport.get('delivered', 0)}",
                f"Completed agri sales: {storage.get('completed_sales', 0)}",
            ],
        },
        {
            "id": "sdg8",
            "number": 8,
            "title": "Decent Work & Economic Growth",
            "theme": "Farmer Income & Rural Jobs",
            "score": score_sdg8,
            "highlights": [
                f"Economic value tracked: INR {int(economic_value):,}",
                f"Delivered buyer orders: {buyer.get('orders_delivered', 0)}",
            ],
        },
        {
            "id": "sdg12",
            "number": 12,
            "title": "Responsible Consumption & Production",
            "theme": "Storage, Quality & Waste Reduction",
            "score": score_sdg12,
            "highlights": [
                f"Inventory items managed: {storage.get('inventory_items', 0)}",
                f"Low stock risk items: {storage.get('low_stock_items', 0)}",
            ],
        },
        {
            "id": "sdg13",
            "number": 13,
            "title": "Climate Action",
            "theme": "Risk Response & Adaptation",
            "score": score_sdg13,
            "highlights": [
                f"In-transit trips: {transport.get('in_transit', 0)}",
                f"Open route jobs: {transport.get('open_jobs', 0)}",
            ],
        },
        {
            "id": "sdg15",
            "number": 15,
            "title": "Life on Land",
            "theme": "Soil Health & Ecosystem Resilience",
            "score": score_sdg15,
            "highlights": [
                f"Total buyer orders: {buyer.get('orders_total', 0)}",
                f"Delivered logistics cycles: {transport.get('delivered', 0)}",
            ],
        },
    ]

    overall_score = int(round(sum(goal["score"] for goal in goals) / len(goals)))
    return goals, overall_score


@router.get("/dashboard")
def get_sdg_dashboard(role: Optional[str] = Query(default="farmer", description="Role lens for SDG insights")):
    metrics = _compute_metrics()
    goals, overall_score = _build_scores(metrics)

    role_lens = {
        "farmer": "Farmer focus: crop timing, storage, and climate-safe decisions.",
        "buyer": "Buyer focus: demand planning, quality consistency, and reduced waste.",
        "transporter": "Transport focus: route reliability and lower climate disruption risk.",
        "store": "Store focus: warehouse efficiency, quality retention, and food-loss reduction.",
        "admin": "Admin focus: ecosystem-wide SDG performance and intervention planning.",
    }

    role_key = str(role or "farmer").strip().lower()
    return {
        "status": "success",
        "data": {
            "role": role_key,
            "overall_score": overall_score,
            "role_message": role_lens.get(role_key, role_lens["farmer"]),
            "goals": goals,
            "metrics": metrics,
            "source": "live_state",
        },
    }
