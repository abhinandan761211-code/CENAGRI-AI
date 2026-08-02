from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.sarvam_service import get_sarvam_service
from app.services.supabase_state_store import get_dashboard_state_store
from app.services.supabase_db import get_supabase_db

router = APIRouter()


class BuyProductPayload(BaseModel):
    quantity: Optional[str] = None


class SellerProductCreatePayload(BaseModel):
    seller_id: int
    seller_name: str
    name: str
    category: str = "General"
    price: float
    stock: float
    unit: str = "kg"
    location: str = ""
    quality: str = "A"
    image: str = "🌾"
    image_url: Optional[str] = None
    description: str = ""


class SellerProductUpdatePayload(BaseModel):
    seller_id: int
    seller_name: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[float] = None
    unit: Optional[str] = None
    location: Optional[str] = None
    quality: Optional[str] = None
    image: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    is_available: Optional[bool] = None


class SellerOrderStatusPayload(BaseModel):
    seller_id: int
    status: str


class BuyerCartItemPayload(BaseModel):
    product_id: int
    quantity: float = 1


class BuyerAddressPayload(BaseModel):
    label: str = "Home"
    fullName: str
    phone: str
    address: str
    isDefault: bool = False


class BuyerSettingsPayload(BaseModel):
    emailUpdates: bool = True
    smsUpdates: bool = False
    language: str = "English"


DEFAULT_BUYER_PRODUCTS = [
    {
        "id": 1,
        "name": "Premium Wheat",
        "farmer": "Rajesh Kumar",
        "price": 2200,
        "quantity": "50kg",
        "location": "Punjab",
        "quality": "A+",
        "image": "🌾",
    },
    {
        "id": 2,
        "name": "Organic Rice",
        "farmer": "Priya Sharma",
        "price": 3500,
        "quantity": "25kg",
        "location": "West Bengal",
        "quality": "A+",
        "image": "🌾",
    },
    {
        "id": 3,
        "name": "Fresh Tomatoes",
        "farmer": "Amit Singh",
        "price": 800,
        "quantity": "20kg",
        "location": "Maharashtra",
        "quality": "A",
        "image": "🍅",
    },
    {
        "id": 4,
        "name": "Sugarcane",
        "farmer": "Vijay Patel",
        "price": 2800,
        "quantity": "100kg",
        "location": "Uttar Pradesh",
        "quality": "A+",
        "image": "🌿",
    },
]

DEFAULT_BUYER_ORDERS = [
    {
        "id": 1,
        "product": "Premium Wheat",
        "farmer": "Rajesh Kumar",
        "quantity": "30kg",
        "price": 66000,
        "status": "Delivered",
        "date": "2024-01-15",
    },
    {
        "id": 2,
        "product": "Organic Rice",
        "farmer": "Priya Sharma",
        "quantity": "15kg",
        "price": 52500,
        "status": "In Transit",
        "date": "2024-01-14",
    },
    {
        "id": 3,
        "product": "Fresh Tomatoes",
        "farmer": "Amit Singh",
        "quantity": "10kg",
        "price": 8000,
        "status": "Processing",
        "date": "2024-01-13",
    },
]

DEFAULT_BUYER_FAVORITES = [1, 2, 3, 4]

BUYER_SCOPE = "buyer_dashboard"
SELLER_DASHBOARD_SCOPE = "seller_dashboard"
state_store = get_dashboard_state_store()
supabase_db = get_supabase_db()


def _safe_float(value, fallback: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_int(value, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _parse_quantity_value(quantity_text: str) -> float:
    if quantity_text is None:
        return 1.0
    cleaned = "".join(ch for ch in str(quantity_text) if ch.isdigit() or ch == ".")
    if not cleaned:
        return 1.0
    try:
        value = float(cleaned)
        return value if value > 0 else 1.0
    except ValueError:
        return 1.0


def _product_row_to_dashboard_product(row: dict) -> dict:
    stock = _safe_float(row.get("stock"), 0)
    unit = str(row.get("unit") or "kg")
    seller_name = "Unknown Farmer"
    seller_id = row.get("seller_id")
    if seller_id is not None:
        seller = supabase_db.get_user_by_id(seller_id)
        if seller:
            seller_name = seller.get("name") or seller_name

    rating = _safe_float(row.get("rating"), 4.0)
    quality = "A+" if rating >= 4.5 else "A" if rating >= 3.8 else "B"
    category = str(row.get("category") or "General").lower()
    if "tomato" in category or "vegetable" in category:
        image = "🍅"
    elif "fruit" in category:
        image = "🍎"
    elif "rice" in category:
        image = "🍚"
    elif "wheat" in category or "grain" in category:
        image = "🌾"
    else:
        image = "🌿"

    stored_image_url = row.get("image_url") or ""

    return {
        "id": _safe_int(row.get("id"), 0),
        "name": row.get("name") or "Unnamed Crop",
        "farmer": seller_name,
        "price": _safe_int(row.get("price"), 0),
        "quantity": f"{int(stock) if stock.is_integer() else round(stock, 2)}{unit}",
        "location": row.get("location") or "Unknown",
        "quality": quality,
        "image": image,
        "image_url": stored_image_url or None,
        "category": row.get("category") or "General",
        "stock": stock,
        "unit": unit,
        "is_available": bool(row.get("is_available", True)) and stock > 0,
        "description": row.get("description") or "",
        "seller_id": seller_id,
    }


def _get_marketplace_products() -> list[dict]:
    rows = supabase_db.get_products()
    mapped = [_product_row_to_dashboard_product(row) for row in rows]
    available = [item for item in mapped if item.get("is_available")]
    if available:
        return available
    return [dict(item) for item in DEFAULT_BUYER_PRODUCTS]


def _default_buyer_state():
    return {
        "products": [dict(item) for item in DEFAULT_BUYER_PRODUCTS],
        "orders": [dict(item) for item in DEFAULT_BUYER_ORDERS],
        "favorites": list(DEFAULT_BUYER_FAVORITES),
        "recently_viewed": [],
        "cart": [],
        "addresses": [
            {
                "id": 1,
                "label": "Home",
                "fullName": "Buyer User",
                "phone": "9000000000",
                "address": "Nashik, Maharashtra",
                "isDefault": True,
            }
        ],
        "settings": {
            "emailUpdates": True,
            "smsUpdates": False,
            "language": "English",
        },
    }


def _get_buyer_state():
    state = state_store.get_state(BUYER_SCOPE, _default_buyer_state())
    if "products" not in state:
        state["products"] = [dict(item) for item in DEFAULT_BUYER_PRODUCTS]
    if "orders" not in state:
        state["orders"] = [dict(item) for item in DEFAULT_BUYER_ORDERS]
    if "favorites" not in state:
        state["favorites"] = list(DEFAULT_BUYER_FAVORITES)
    if "recently_viewed" not in state or not isinstance(state.get("recently_viewed"), list):
        state["recently_viewed"] = []
    if "cart" not in state or not isinstance(state.get("cart"), list):
        state["cart"] = []
    if "addresses" not in state or not isinstance(state.get("addresses"), list):
        state["addresses"] = _default_buyer_state().get("addresses", [])
    if "settings" not in state or not isinstance(state.get("settings"), dict):
        state["settings"] = _default_buyer_state().get("settings", {})
    return state


def _save_buyer_state(state):
    return state_store.save_state(BUYER_SCOPE, state)


def _extract_kg(quantity_text: str) -> int:
    digits = "".join(ch for ch in quantity_text if ch.isdigit())
    return int(digits) if digits else 1


def _build_dashboard_payload():
    state = _get_buyer_state()
    products = _get_marketplace_products()
    state["products"] = products
    _save_buyer_state(state)
    orders = state.get("orders", [])
    favorites = state.get("favorites", [])
    recently_viewed = state.get("recently_viewed", [])
    cart = state.get("cart", [])
    addresses = state.get("addresses", [])
    settings = state.get("settings", {})

    total_spent = sum(_safe_int(order.get("price"), 0) for order in orders)
    active_orders = len(
        [order for order in orders if order.get("status") not in {"Delivered", "Cancelled"}]
    )
    notifications = [
        {
            "id": f"ORDER-{order.get('id')}",
            "message": f"Order #{order.get('id')} is {order.get('status', 'Processing')}",
            "time": order.get("date", "Today"),
        }
        for order in orders[:5]
    ]
    notifications.append(
        {
            "id": "OFFER-1",
            "message": "New weekend offer: extra 8% off on grains",
            "time": "Today",
        }
    )

    return {
        "products": products,
        "orders": orders,
        "favorites": favorites,
        "recently_viewed": recently_viewed,
        "cart": cart,
        "addresses": addresses,
        "settings": settings,
        "notifications": notifications,
        "stats": {
            "total_orders": len(orders),
            "total_spent": total_spent,
            "active_orders": active_orders,
            "saved_products": len(favorites),
        },
    }


def _default_seller_dashboard_state() -> dict[str, Any]:
    return {
        "orders": {},
        "payments": {},
        "reviews": {},
    }


def _build_default_seller_orders(seller_id: int) -> list[dict[str, Any]]:
    rows = supabase_db.get_products_by_seller(seller_id)
    mapped = [_product_row_to_dashboard_product(row) for row in rows]
    top = mapped[:4]
    if not top:
        return [
            {
                "id": "ORD-1001",
                "product": "Tomato",
                "customer": "Ravi Kumar",
                "status": "Pending",
                "price": 4200,
                "qty": 105,
            },
            {
                "id": "ORD-1002",
                "product": "Wheat",
                "customer": "Anita Sharma",
                "status": "Shipped",
                "price": 9600,
                "qty": 240,
            },
        ]

    seeded: list[dict[str, Any]] = []
    statuses = ["Pending", "Shipped", "Delivered", "Pending"]
    customers = ["FreshCart Foods", "Metro Mandi", "Green Basket", "City Buyer"]
    for idx, item in enumerate(top):
        seeded.append(
            {
                "id": f"ORD-{seller_id}{idx + 1:03d}",
                "product": item.get("name") or "Product",
                "customer": customers[idx % len(customers)],
                "status": statuses[idx % len(statuses)],
                "price": int(_safe_float(item.get("price"), 0) * max(_safe_float(item.get("stock"), 1), 1)),
                "qty": int(max(_safe_float(item.get("stock"), 1), 1)),
            }
        )
    return seeded


def _build_default_seller_payments() -> list[dict[str, Any]]:
    return [
        {"id": "PAY-221", "date": "2026-03-14", "amount": 8200, "status": "Credited", "method": "UPI"},
        {"id": "PAY-219", "date": "2026-03-11", "amount": 5400, "status": "Credited", "method": "Bank Transfer"},
        {"id": "PAY-217", "date": "2026-03-09", "amount": 3700, "status": "Pending", "method": "Bank Transfer"},
    ]


def _build_default_seller_reviews() -> list[dict[str, Any]]:
    return [
        {"id": 1, "product": "Apple", "rating": 4, "comment": "Good quality"},
        {"id": 2, "product": "Tomato", "rating": 5, "comment": "Fresh and clean produce"},
        {"id": 3, "product": "Wheat", "rating": 4, "comment": "Accurate quantity and timely dispatch"},
    ]


def _get_seller_dashboard_state() -> dict[str, Any]:
    state = state_store.get_state(SELLER_DASHBOARD_SCOPE, _default_seller_dashboard_state())
    if "orders" not in state or not isinstance(state.get("orders"), dict):
        state["orders"] = {}
    if "payments" not in state or not isinstance(state.get("payments"), dict):
        state["payments"] = {}
    if "reviews" not in state or not isinstance(state.get("reviews"), dict):
        state["reviews"] = {}
    return state


def _save_seller_dashboard_state(state: dict[str, Any]):
    return state_store.save_state(SELLER_DASHBOARD_SCOPE, state)


def _seller_dashboard_payload(seller_id: int) -> dict[str, Any]:
    state = _get_seller_dashboard_state()
    key = str(seller_id)

    orders = state["orders"].get(key)
    if not isinstance(orders, list) or len(orders) == 0:
        orders = _build_default_seller_orders(seller_id)
        state["orders"][key] = orders

    payments = state["payments"].get(key)
    if not isinstance(payments, list) or len(payments) == 0:
        payments = _build_default_seller_payments()
        state["payments"][key] = payments

    reviews = state["reviews"].get(key)
    if not isinstance(reviews, list) or len(reviews) == 0:
        reviews = _build_default_seller_reviews()
        state["reviews"][key] = reviews

    _save_seller_dashboard_state(state)

    total_orders = len(orders)
    pending_orders = len([o for o in orders if str(o.get("status")) == "Pending"])
    total_revenue = sum(_safe_int(o.get("price"), 0) for o in orders if str(o.get("status")) != "Cancelled")
    total_sales = sum(_safe_int(o.get("price"), 0) for o in orders if str(o.get("status")) == "Delivered")
    total_products = len(supabase_db.get_products_by_seller(seller_id))

    return {
        "orders": orders,
        "payments": payments,
        "reviews": reviews,
        "stats": {
            "total_sales": total_sales,
            "total_orders": total_orders,
            "total_products": total_products,
            "pending_orders": pending_orders,
            "total_revenue": total_revenue,
        },
    }

SAMPLE_BUYERS = [
    {
        "name": "FreshFoods Pvt Ltd",
        "state": "maharashtra",
        "commodities": ["tomato", "onion", "potato"],
        "quality": "premium",
        "capacity": 800,
    },
    {
        "name": "AgriBulk Traders",
        "state": "madhya pradesh",
        "commodities": ["wheat", "chana", "soybean"],
        "quality": "grade a",
        "capacity": 2000,
    },
    {
        "name": "Metro Mandis Network",
        "state": "delhi",
        "commodities": ["rice", "wheat", "onion", "tomato"],
        "quality": "grade b",
        "capacity": 1500,
    },
]

@router.get("/")
def find_buyers():
    return {"buyers": SAMPLE_BUYERS}


@router.get("/dashboard")
def buyer_dashboard():
    return {"status": "success", "data": _build_dashboard_payload()}


@router.post("/dashboard/products/{product_id}/buy")
def buy_dashboard_product(product_id: int, payload: BuyProductPayload):
    state = _get_buyer_state()
    products = _get_marketplace_products()
    orders = state.get("orders", [])

    product = next((item for item in products if item.get("id") == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    requested_quantity_text = payload.quantity or "1"
    requested_quantity = _parse_quantity_value(requested_quantity_text)

    available_stock = _safe_float(product.get("stock"), _parse_quantity_value(product.get("quantity", "1")))
    if requested_quantity > available_stock:
        raise HTTPException(status_code=400, detail="Requested quantity exceeds available stock")

    price = _safe_float(product.get("price"), 0)
    order_value = int(price * requested_quantity)
    quantity_unit = str(product.get("unit") or "kg")
    quantity_label = f"{requested_quantity:g}{quantity_unit}"

    new_order = {
        "id": max([item["id"] for item in orders] + [0]) + 1,
        "product": product.get("name", "Unknown"),
        "farmer": product.get("farmer", "Unknown"),
        "quantity": quantity_label,
        "price": order_value,
        "status": "Processing",
        "date": str(date.today()),
    }
    orders.insert(0, new_order)

    # Update marketplace stock immediately so buyers see fast updates.
    remaining_stock = max(available_stock - requested_quantity, 0)
    supabase_db.update_product(
        product_id,
        {
            "stock": remaining_stock,
            "is_available": remaining_stock > 0,
        },
    )

    try:
        supabase_db.create_order(
            {
                "buyer_id": None,
                "product_id": product_id,
                "product_name": product.get("name", "Unknown"),
                "quantity": requested_quantity,
                "price": price,
                "status": "pending",
                "notes": "Created from buyer dashboard",
            }
        )
    except Exception:
        # Keep dashboard UX non-blocking if order table insert fails.
        pass

    _save_buyer_state(state)

    return {"status": "success", "data": _build_dashboard_payload()}


@router.get("/seller/products")
def get_seller_products(
    seller_id: Optional[int] = Query(None, description="Seller user id"),
    only_available: bool = Query(False, description="Filter only available listings"),
):
    rows = supabase_db.get_products_by_seller(seller_id) if seller_id else supabase_db.get_products()
    mapped = [_product_row_to_dashboard_product(row) for row in rows]
    if only_available:
        mapped = [item for item in mapped if item.get("is_available")]
    return {"status": "success", "data": {"products": mapped}}


@router.post("/seller/products")
def create_seller_product(payload: SellerProductCreatePayload):
    data = payload.model_dump()
    stock = _safe_float(data.get("stock"), 0)
    insert_data: dict = {
        "seller_id": data["seller_id"],
        "name": data["name"],
        "category": data.get("category") or "General",
        "price": _safe_float(data.get("price"), 0),
        "stock": stock,
        "unit": data.get("unit") or "kg",
        "location": data.get("location") or "",
        "description": data.get("description") or "",
        "is_available": stock > 0,
        "rating": 4.2,
    }
    if data.get("image_url"):
        insert_data["image_url"] = data["image_url"]
    try:
        row = supabase_db.create_product(insert_data)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not save crop listing. Make sure your account is registered. ({exc})",
        )
    return {
        "status": "success",
        "data": {
            "product": _product_row_to_dashboard_product(row),
            "products": [_product_row_to_dashboard_product(item) for item in supabase_db.get_products_by_seller(data["seller_id"])],
        },
    }


@router.patch("/seller/products/{product_id}")
def update_seller_product(product_id: int, payload: SellerProductUpdatePayload):
    data = payload.model_dump(exclude_none=True)
    seller_id = data.pop("seller_id", None)
    if not seller_id:
        raise HTTPException(status_code=400, detail="seller_id is required")

    # Keep only columns that exist in `products` table.
    allowed_fields = {
        "name",
        "category",
        "price",
        "stock",
        "unit",
        "location",
        "description",
        "is_available",
        "image_url",
    }
    data = {key: value for key, value in data.items() if key in allowed_fields}
    if not data:
        raise HTTPException(status_code=400, detail="No valid product fields to update")

    existing = next((item for item in supabase_db.get_products_by_seller(int(seller_id)) if int(item.get("id", 0)) == product_id), None)
    if existing is None:
        raise HTTPException(status_code=404, detail="Product not found for seller")

    if "stock" in data:
        stock = _safe_float(data.get("stock"), 0)
        data["stock"] = stock
        if "is_available" not in data:
            data["is_available"] = stock > 0

    updated = supabase_db.update_product(product_id, data)
    if not updated:
        raise HTTPException(status_code=500, detail="Unable to update product")

    return {
        "status": "success",
        "data": {
            "product": _product_row_to_dashboard_product(updated),
            "products": [_product_row_to_dashboard_product(item) for item in supabase_db.get_products_by_seller(int(seller_id))],
        },
    }


@router.delete("/seller/products/{product_id}")
def delete_seller_product(product_id: int, seller_id: int = Query(..., description="Seller user id")):
    existing = next((item for item in supabase_db.get_products_by_seller(seller_id) if int(item.get("id", 0)) == product_id), None)
    if existing is None:
        raise HTTPException(status_code=404, detail="Product not found for seller")

    ok = supabase_db.delete_product(product_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Unable to delete product")

    return {
        "status": "success",
        "data": {
            "products": [_product_row_to_dashboard_product(item) for item in supabase_db.get_products_by_seller(seller_id)],
        },
    }


@router.get("/seller/dashboard")
def get_seller_dashboard(seller_id: int = Query(..., description="Seller user id")):
    if seller_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid seller_id")
    return {"status": "success", "data": _seller_dashboard_payload(seller_id)}


@router.patch("/seller/orders/{order_id}/status")
def update_seller_order_status(order_id: str, payload: SellerOrderStatusPayload):
    if payload.seller_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid seller_id")

    state = _get_seller_dashboard_state()
    key = str(payload.seller_id)
    orders = state.get("orders", {}).get(key)
    if not isinstance(orders, list) or len(orders) == 0:
        orders = _seller_dashboard_payload(payload.seller_id).get("orders", [])

    updated = False
    for item in orders:
        if str(item.get("id")) == str(order_id):
            item["status"] = payload.status
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Order not found")

    state["orders"][key] = orders
    _save_seller_dashboard_state(state)

    return {"status": "success", "data": _seller_dashboard_payload(payload.seller_id)}


@router.post("/dashboard/favorites/{product_id}/toggle")
def toggle_dashboard_favorite(product_id: int):
    state = _get_buyer_state()
    products = state.get("products", [])
    favorites = state.get("favorites", [])

    product = next((item for item in products if item.get("id") == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    if product_id in favorites:
        favorites.remove(product_id)
    else:
        favorites.insert(0, product_id)

    _save_buyer_state(state)

    return {"status": "success", "data": _build_dashboard_payload()}


@router.post("/dashboard/viewed/{product_id}")
def mark_dashboard_product_viewed(product_id: int):
    state = _get_buyer_state()
    products = state.get("products", [])
    recently_viewed = state.get("recently_viewed", [])

    product = next((item for item in products if item.get("id") == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    next_recently_viewed = [product_id, *[item for item in recently_viewed if item != product_id]]
    state["recently_viewed"] = next_recently_viewed[:10]
    _save_buyer_state(state)

    return {"status": "success", "data": _build_dashboard_payload()}


@router.post("/dashboard/cart")
def add_dashboard_cart_item(payload: BuyerCartItemPayload):
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be greater than 0")

    state = _get_buyer_state()
    products = _get_marketplace_products()
    product = next((item for item in products if item.get("id") == payload.product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    cart = state.get("cart", [])
    existing = next((item for item in cart if _safe_int(item.get("product_id"), 0) == payload.product_id), None)
    if existing:
        existing["quantity"] = _safe_float(existing.get("quantity"), 0) + payload.quantity
    else:
        cart.append({"product_id": payload.product_id, "quantity": payload.quantity})

    state["cart"] = cart
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.patch("/dashboard/cart/{product_id}")
def update_dashboard_cart_item(product_id: int, payload: BuyerCartItemPayload):
    state = _get_buyer_state()
    cart = state.get("cart", [])

    if payload.quantity <= 0:
        cart = [item for item in cart if _safe_int(item.get("product_id"), 0) != product_id]
    else:
        found = False
        for item in cart:
            if _safe_int(item.get("product_id"), 0) == product_id:
                item["quantity"] = payload.quantity
                found = True
                break
        if not found:
            cart.append({"product_id": product_id, "quantity": payload.quantity})

    state["cart"] = cart
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.delete("/dashboard/cart/{product_id}")
def remove_dashboard_cart_item(product_id: int):
    state = _get_buyer_state()
    cart = state.get("cart", [])
    state["cart"] = [item for item in cart if _safe_int(item.get("product_id"), 0) != product_id]
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.post("/dashboard/cart/checkout")
def checkout_dashboard_cart():
    state = _get_buyer_state()
    cart = state.get("cart", [])
    products = _get_marketplace_products()

    if len(cart) == 0:
        raise HTTPException(status_code=400, detail="Cart is empty")

    orders = state.get("orders", [])
    next_id = max([_safe_int(item.get("id"), 0) for item in orders] + [0]) + 1

    for item in cart:
        product_id = _safe_int(item.get("product_id"), 0)
        qty = max(_safe_float(item.get("quantity"), 0), 0)
        if qty <= 0:
            continue
        product = next((row for row in products if _safe_int(row.get("id"), 0) == product_id), None)
        if product is None:
            continue

        available_stock = _safe_float(product.get("stock"), _parse_quantity_value(product.get("quantity", "1")))
        order_qty = min(qty, max(available_stock, 0))
        if order_qty <= 0:
            continue

        unit = str(product.get("unit") or "kg")
        price = _safe_float(product.get("price"), 0)
        orders.insert(
            0,
            {
                "id": next_id,
                "product": product.get("name", "Unknown"),
                "farmer": product.get("farmer", "Unknown"),
                "quantity": f"{order_qty:g}{unit}",
                "price": int(price * order_qty),
                "status": "Processing",
                "date": str(date.today()),
            },
        )
        next_id += 1

        remaining_stock = max(available_stock - order_qty, 0)
        supabase_db.update_product(
            product_id,
            {
                "stock": remaining_stock,
                "is_available": remaining_stock > 0,
            },
        )

    state["orders"] = orders
    state["cart"] = []
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.post("/dashboard/addresses")
def create_dashboard_address(payload: BuyerAddressPayload):
    state = _get_buyer_state()
    addresses = state.get("addresses", [])
    next_id = max([_safe_int(item.get("id"), 0) for item in addresses] + [0]) + 1

    if payload.isDefault:
        addresses = [{**item, "isDefault": False} for item in addresses]

    addresses.insert(
        0,
        {
            "id": next_id,
            **payload.model_dump(),
        },
    )
    state["addresses"] = addresses
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.patch("/dashboard/addresses/{address_id}")
def update_dashboard_address(address_id: int, payload: BuyerAddressPayload):
    state = _get_buyer_state()
    addresses = state.get("addresses", [])

    updated = False
    if payload.isDefault:
        addresses = [{**item, "isDefault": False} for item in addresses]

    for idx, item in enumerate(addresses):
        if _safe_int(item.get("id"), 0) == address_id:
            addresses[idx] = {
                "id": address_id,
                **payload.model_dump(),
            }
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Address not found")

    state["addresses"] = addresses
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.patch("/dashboard/addresses/{address_id}/default")
def set_dashboard_default_address(address_id: int):
    state = _get_buyer_state()
    addresses = state.get("addresses", [])
    found = False
    next_addresses = []
    for item in addresses:
        is_current = _safe_int(item.get("id"), 0) == address_id
        if is_current:
            found = True
        next_addresses.append({**item, "isDefault": is_current})

    if not found:
        raise HTTPException(status_code=404, detail="Address not found")

    state["addresses"] = next_addresses
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.delete("/dashboard/addresses/{address_id}")
def delete_dashboard_address(address_id: int):
    state = _get_buyer_state()
    addresses = state.get("addresses", [])
    next_addresses = [item for item in addresses if _safe_int(item.get("id"), 0) != address_id]
    if len(next_addresses) == len(addresses):
        raise HTTPException(status_code=404, detail="Address not found")

    if next_addresses and not any(bool(item.get("isDefault")) for item in next_addresses):
        next_addresses[0]["isDefault"] = True

    state["addresses"] = next_addresses
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.patch("/dashboard/settings")
def update_dashboard_settings(payload: BuyerSettingsPayload):
    state = _get_buyer_state()
    state["settings"] = payload.model_dump()
    _save_buyer_state(state)
    return {"status": "success", "data": _build_dashboard_payload()}


@router.get("/match-ai")
def match_buyers_ai(
    crop: str = Query(..., description="Crop name"),
    quality: str = Query("grade a", description="Quality grade"),
    state: str = Query("", description="Seller state"),
    quantity: float = Query(0, description="Available quantity"),
    language: str = Query("en", description="Language code"),
):
    crop_norm = crop.lower().strip()
    quality_norm = quality.lower().strip()
    state_norm = state.lower().strip()

    scored = []
    for buyer in SAMPLE_BUYERS:
        score = 0
        if crop_norm in buyer["commodities"]:
            score += 45
        if state_norm and state_norm == buyer["state"]:
            score += 25
        if quantity and buyer["capacity"] >= quantity:
            score += 20
        if quality_norm and quality_norm in buyer["quality"]:
            score += 10

        if score > 0:
            scored.append({**buyer, "match_score": score})

    scored.sort(key=lambda b: b["match_score"], reverse=True)
    top = scored[:3]

    service = get_sarvam_service()
    buyer_names = ", ".join(b["name"] for b in top) if top else "No ideal buyer"
    ai = service.generate_text(
        system_prompt="You are an agri procurement assistant.",
        user_prompt=(
            f"Crop: {crop}, Quality: {quality}, State: {state}, Quantity: {quantity}. "
            f"Top candidates: {buyer_names}. Give a 2-line matching recommendation in {language}."
        ),
        temperature=0.2,
        max_tokens=160,
    )

    recommendation = ai.get("text") if ai.get("ok") else (
        "Prioritize buyers with same-state logistics and matching quality specs."
        if language != "hi"
        else "उसी राज्य के खरीदार और गुणवत्ता मेल खाने वालों को प्राथमिकता दें।"
    )

    return {
        "status": "success",
        "data": {
            "matches": top,
            "recommendation": recommendation,
            "source": ai.get("source", "rules_fallback") if ai else "rules_fallback",
        },
    }
