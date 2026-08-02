from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.sarvam_service import get_sarvam_service
from app.services.supabase_state_store import get_dashboard_state_store

router = APIRouter()


class InventoryCreatePayload(BaseModel):
    name: str
    category: str
    stock: int
    price: int
    supplier: str


class InventoryUpdatePayload(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    stock: Optional[int] = None
    price: Optional[int] = None
    supplier: Optional[str] = None
    status: Optional[str] = None


DEFAULT_STORE_INVENTORY = [
    {
        "id": 1,
        "name": "Fertilizer A",
        "category": "Fertilizers",
        "stock": 150,
        "price": 1200,
        "supplier": "AgriCorp",
        "status": "In Stock",
    },
    {
        "id": 2,
        "name": "Pesticide X",
        "category": "Pesticides",
        "stock": 45,
        "price": 850,
        "supplier": "FarmChem",
        "status": "Low Stock",
    },
    {
        "id": 3,
        "name": "Seeds Pack",
        "category": "Seeds",
        "stock": 200,
        "price": 450,
        "supplier": "SeedMaster",
        "status": "In Stock",
    },
    {
        "id": 4,
        "name": "Tractor Oil",
        "category": "Equipment",
        "stock": 25,
        "price": 2200,
        "supplier": "AutoParts",
        "status": "Low Stock",
    },
]

DEFAULT_STORE_SALES = [
    {
        "id": 1,
        "product": "Fertilizer A",
        "quantity": 5,
        "amount": 6000,
        "customer": "Rajesh Kumar",
        "date": "2024-01-15",
        "status": "Completed",
    },
    {
        "id": 2,
        "product": "Pesticide X",
        "quantity": 3,
        "amount": 2550,
        "customer": "Priya Sharma",
        "date": "2024-01-14",
        "status": "Completed",
    },
    {
        "id": 3,
        "product": "Seeds Pack",
        "quantity": 10,
        "amount": 4500,
        "customer": "Amit Singh",
        "date": "2024-01-13",
        "status": "Pending",
    },
]

DEFAULT_STORE_SUPPLIERS = [
    {"id": 1, "name": "AgriCorp", "products": "Fertilizers", "rating": 4.8, "orders": 25, "lastOrder": "2024-01-10"},
    {"id": 2, "name": "FarmChem", "products": "Pesticides", "rating": 4.6, "orders": 18, "lastOrder": "2024-01-08"},
    {"id": 3, "name": "SeedMaster", "products": "Seeds", "rating": 4.9, "orders": 32, "lastOrder": "2024-01-12"},
]

STORE_SCOPE = "store_dashboard"
state_store = get_dashboard_state_store()


def _default_store_state():
    return {
        "inventory": [dict(item) for item in DEFAULT_STORE_INVENTORY],
        "sales": [dict(item) for item in DEFAULT_STORE_SALES],
        "suppliers": [dict(item) for item in DEFAULT_STORE_SUPPLIERS],
    }


def _get_store_state():
    state = state_store.get_state(STORE_SCOPE, _default_store_state())
    if "inventory" not in state:
        state["inventory"] = [dict(item) for item in DEFAULT_STORE_INVENTORY]
    if "sales" not in state:
        state["sales"] = [dict(item) for item in DEFAULT_STORE_SALES]
    if "suppliers" not in state:
        state["suppliers"] = [dict(item) for item in DEFAULT_STORE_SUPPLIERS]
    return state


def _save_store_state(state):
    return state_store.save_state(STORE_SCOPE, state)


def _inventory_status(stock: int) -> str:
    return "Low Stock" if stock <= 50 else "In Stock"


def _store_dashboard_payload():
    state = _get_store_state()
    inventory = state.get("inventory", [])
    sales = state.get("sales", [])
    suppliers = state.get("suppliers", [])

    monthly_sales = sum(int(item.get("amount", 0)) for item in sales)
    low_stock_count = len([item for item in inventory if item.get("status") == "Low Stock"])
    return {
        "inventory": inventory,
        "sales": sales,
        "suppliers": suppliers,
        "stats": {
            "total_products": len(inventory),
            "monthly_sales": monthly_sales,
            "low_stock_items": low_stock_count,
            "active_suppliers": len(suppliers),
        },
    }


@router.get("/")
def storage_home():
    return {
        "status": "success",
        "storage": [
            {"name": "Pune Cold Chain Hub", "capacity": 1200, "type": "cold"},
            {"name": "Nashik Dry Warehouse", "capacity": 3000, "type": "dry"},
        ],
    }


@router.get("/dashboard")
def store_dashboard():
    return {"status": "success", "data": _store_dashboard_payload()}


@router.post("/dashboard/inventory")
def create_store_inventory(payload: InventoryCreatePayload):
    state = _get_store_state()
    inventory = state.get("inventory", [])

    stock_value = max(0, int(payload.stock))
    new_item = {
        "id": max([item["id"] for item in inventory] + [0]) + 1,
        "name": payload.name,
        "category": payload.category,
        "stock": stock_value,
        "price": int(payload.price),
        "supplier": payload.supplier,
        "status": _inventory_status(stock_value),
    }
    inventory.insert(0, new_item)
    _save_store_state(state)
    return {"status": "success", "data": _store_dashboard_payload()}


@router.patch("/dashboard/inventory/{item_id}")
def update_store_inventory(item_id: int, payload: InventoryUpdatePayload):
    state = _get_store_state()
    inventory = state.get("inventory", [])
    item = next((entry for entry in inventory if entry.get("id") == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    updates = payload.model_dump(exclude_none=True)
    if "stock" in updates:
        updates["status"] = _inventory_status(int(updates["stock"]))
    item.update(updates)
    _save_store_state(state)

    return {"status": "success", "data": _store_dashboard_payload()}


@router.delete("/dashboard/inventory/{item_id}")
def delete_store_inventory(item_id: int):
    state = _get_store_state()
    inventory = state.get("inventory", [])
    item = next((entry for entry in inventory if entry.get("id") == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    inventory.remove(item)
    _save_store_state(state)
    return {"status": "success", "data": _store_dashboard_payload()}

@router.post("/book")
def book_storage():
    return {"detail": "storage booked"}

@router.get("/list")
def list_storage():
    return {"storage": []}


@router.get("/capacity-forecast")
def capacity_forecast(
    crop: str = Query(..., description="Crop name"),
    quantity: float = Query(0, description="Expected quantity"),
    season: str = Query("current", description="Season"),
    language: str = Query("en", description="Language code"),
):
    service = get_sarvam_service()
    ai = service.generate_text(
        system_prompt="You are an agri warehouse planning specialist.",
        user_prompt=(
            f"Crop: {crop}, Quantity: {quantity}, Season: {season}. "
            "Suggest storage capacity planning, retention duration, and spoilage controls in 3 bullets."
        ),
        temperature=0.2,
        max_tokens=220,
    )

    base_required = max(10.0, quantity * 1.1) if quantity else 100.0
    default_note = (
        "Plan 10% extra buffer capacity and rotate inventory using FIFO."
        if language != "hi"
        else "10% अतिरिक्त बफर क्षमता रखें और FIFO के अनुसार स्टॉक घुमाएं।"
    )

    return {
        "status": "success",
        "data": {
            "crop": crop,
            "season": season,
            "estimated_required_capacity": round(base_required, 2),
            "unit": "quintal",
            "recommendation": ai.get("text") if ai.get("ok") else default_note,
            "source": ai.get("source", "rules_fallback"),
        },
    }
