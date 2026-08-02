import json
import os
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.sarvam_service import get_sarvam_service
from app.services.supabase_state_store import get_dashboard_state_store

router = APIRouter()


class BookingStatusUpdate(BaseModel):
    status: Optional[str] = None


class VehicleUpdate(BaseModel):
    type: Optional[str] = None
    capacity: Optional[str] = None
    registration: Optional[str] = None
    status: Optional[str] = None
    fuel_type: Optional[str] = None


class DeliveryProofUpdate(BaseModel):
    photo_url: Optional[str] = None
    signature_name: Optional[str] = None
    otp_code: Optional[str] = None
    notes: Optional[str] = None


DEFAULT_AVAILABLE_BOOKINGS = [
    {
        "id": 1,
        "from": "Delhi",
        "to": "Mumbai",
        "distance": "1400km",
        "weight": "2 tons",
        "commodity": "Wheat",
        "price": 25000,
        "farmer": "Rajesh Kumar",
        "phone": "+919876543210",
        "date": "2024-01-16",
    },
    {
        "id": 2,
        "from": "Punjab",
        "to": "Gujarat",
        "distance": "800km",
        "weight": "1.5 tons",
        "commodity": "Rice",
        "price": 18000,
        "farmer": "Priya Sharma",
        "phone": "+919123456780",
        "date": "2024-01-17",
    },
    {
        "id": 3,
        "from": "UP",
        "to": "Maharashtra",
        "distance": "1000km",
        "weight": "3 tons",
        "commodity": "Sugarcane",
        "price": 35000,
        "farmer": "Amit Singh",
        "phone": "+918765432109",
        "date": "2024-01-18",
    },
]

DEFAULT_MY_BOOKINGS = [
    {
        "id": 101,
        "from": "Haryana",
        "to": "Rajasthan",
        "distance": "500km",
        "weight": "2.5 tons",
        "commodity": "Cotton",
        "price": 22000,
        "status": "In Transit",
        "farmer": "Vijay Patel",
        "phone": "+919998887776",
        "date": "2024-01-14",
    },
    {
        "id": 102,
        "from": "Bihar",
        "to": "West Bengal",
        "distance": "600km",
        "weight": "1 ton",
        "commodity": "Maize",
        "price": 15000,
        "status": "Delivered",
        "farmer": "Sunita Devi",
        "phone": "+919887766554",
        "date": "2024-01-12",
    },
]

DEFAULT_VEHICLE_DATA = {
    "type": "10 Wheeler Truck",
    "capacity": "10 tons",
    "registration": "UP 14 AB 1234",
    "status": "Active",
    "fuel_type": "Diesel",
}

TRANSPORT_SCOPE = "transport_dashboard"
state_store = get_dashboard_state_store()


def _default_transport_state():
    return {
        "available_bookings": [dict(item) for item in DEFAULT_AVAILABLE_BOOKINGS],
        "my_bookings": [dict(item) for item in DEFAULT_MY_BOOKINGS],
        "vehicle": dict(DEFAULT_VEHICLE_DATA),
    }


def _get_transport_state():
    state = state_store.get_state(TRANSPORT_SCOPE, _default_transport_state())
    if "available_bookings" not in state:
        state["available_bookings"] = [dict(item) for item in DEFAULT_AVAILABLE_BOOKINGS]
    if "my_bookings" not in state:
        state["my_bookings"] = [dict(item) for item in DEFAULT_MY_BOOKINGS]
    if "vehicle" not in state:
        state["vehicle"] = dict(DEFAULT_VEHICLE_DATA)
    if "fuel_type" not in state["vehicle"]:
        state["vehicle"]["fuel_type"] = DEFAULT_VEHICLE_DATA.get("fuel_type", "Diesel")
    return state


def _save_transport_state(state):
    return state_store.save_state(TRANSPORT_SCOPE, state)


def _dashboard_payload():
    state = _get_transport_state()
    available_bookings = state.get("available_bookings", [])
    my_bookings = state.get("my_bookings", [])
    vehicle = state.get("vehicle", dict(DEFAULT_VEHICLE_DATA))

    active_bookings = [booking for booking in my_bookings if booking.get("status") != "Delivered"]
    monthly_income = sum(
        int(booking.get("price", 0))
        for booking in my_bookings
        if booking.get("status") == "Delivered"
    )
    return {
        "available_bookings": available_bookings,
        "my_bookings": my_bookings,
        "vehicle": vehicle,
        "stats": {
            "active_bookings": len(active_bookings),
            "total_trips": len(my_bookings),
            "monthly_income": monthly_income,
            "rating": 4.8,
        },
    }


def _next_status(current_status: str) -> str:
    status_flow = ["Assigned", "In Transit", "Delivered"]
    if current_status not in status_flow:
        return "Assigned"
    current_index = status_flow.index(current_status)
    return status_flow[min(current_index + 1, len(status_flow) - 1)]


@router.get("/")
def list_transport():
    return {
        "status": "success",
        "transport": [
            {"provider": "FastFreight", "vehicle_type": "truck", "rate_per_km": 42},
            {"provider": "AgriMove", "vehicle_type": "mini-truck", "rate_per_km": 28},
        ],
    }


@router.get("/dashboard")
def get_transporter_dashboard():
    return {"status": "success", "data": _dashboard_payload()}


@router.post("/dashboard/bookings/{booking_id}/accept")
def accept_dashboard_booking(booking_id: int):
    state = _get_transport_state()
    available_bookings = state.get("available_bookings", [])
    my_bookings = state.get("my_bookings", [])

    booking = next((item for item in available_bookings if item.get("id") == booking_id), None)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found in available jobs")

    available_bookings.remove(booking)
    new_booking = {**booking, "id": max([item["id"] for item in my_bookings] + [100]) + 1, "status": "Assigned"}
    my_bookings.insert(0, new_booking)

    _save_transport_state(state)

    return {"status": "success", "data": _dashboard_payload()}


@router.post("/dashboard/bookings/{booking_id}/reject")
def reject_dashboard_booking(booking_id: int):
    state = _get_transport_state()
    available_bookings = state.get("available_bookings", [])

    booking = next((item for item in available_bookings if item.get("id") == booking_id), None)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found in available jobs")

    available_bookings.remove(booking)
    _save_transport_state(state)

    return {"status": "success", "data": _dashboard_payload()}


@router.patch("/dashboard/bookings/{booking_id}/status")
def update_dashboard_booking_status(booking_id: int, payload: BookingStatusUpdate):
    state = _get_transport_state()
    my_bookings = state.get("my_bookings", [])
    booking = next((item for item in my_bookings if item.get("id") == booking_id), None)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    if payload.status:
        booking["status"] = payload.status
    else:
        booking["status"] = _next_status(str(booking.get("status", "Assigned")))

    _save_transport_state(state)

    return {"status": "success", "data": _dashboard_payload()}


@router.patch("/dashboard/bookings/{booking_id}/proof")
def update_dashboard_delivery_proof(booking_id: int, payload: DeliveryProofUpdate):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No proof details provided")

    state = _get_transport_state()
    my_bookings = state.get("my_bookings", [])
    booking = next((item for item in my_bookings if item.get("id") == booking_id), None)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    delivery_proof = booking.get("delivery_proof", {})
    delivery_proof.update(updates)
    booking["delivery_proof"] = delivery_proof

    _save_transport_state(state)

    return {"status": "success", "data": _dashboard_payload()}


@router.patch("/dashboard/vehicle")
def update_dashboard_vehicle(payload: VehicleUpdate):
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No vehicle fields provided")

    state = _get_transport_state()
    vehicle = state.get("vehicle", dict(DEFAULT_VEHICLE_DATA))
    vehicle.update(updates)
    state["vehicle"] = vehicle
    _save_transport_state(state)

    return {"status": "success", "data": _dashboard_payload()}

@router.post("/book")
def book_transport():
    return {"detail": "transport booked"}


@router.get("/optimize-route")
def optimize_route(
    origin: str = Query(..., description="Pickup location"),
    destination: str = Query(..., description="Drop location"),
    commodity: str = Query("general", description="Commodity"),
    weight: float = Query(0, description="Weight in tons"),
    language: str = Query("en", description="Language code"),
):
    service = get_sarvam_service()
    ai = service.generate_text(
        system_prompt="You are a logistics planner for Indian agri transport.",
        user_prompt=(
            f"Optimize route for commodity {commodity}, {weight} tons from {origin} to {destination}. "
            "Provide route strategy, travel window, and risk notes in 3 bullet points."
        ),
        temperature=0.2,
        max_tokens=200,
    )

    default_recommendation = (
        "Dispatch during non-peak hours, keep one alternate highway route, and use insulated cover for perishables."
        if language != "hi"
        else "नॉन-पीक समय में डिस्पैच करें, एक वैकल्पिक हाईवे रूट रखें, और नाशवंत माल के लिए इंसुलेटेड कवर रखें।"
    )

    return {
        "status": "success",
        "data": {
            "origin": origin,
            "destination": destination,
            "commodity": commodity,
            "weight": weight,
            "recommendation": ai.get("text") if ai.get("ok") else default_recommendation,
            "source": ai.get("source", "rules_fallback"),
        },
    }


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fetch_json(url: str) -> dict:
    with urlopen(url, timeout=8) as response:  # nosec B310 - controlled URLs
        return json.loads(response.read().decode("utf-8"))


@router.get("/route-intelligence")
def route_intelligence(
    origin_lat: float = Query(...),
    origin_lng: float = Query(...),
    destination_lat: float = Query(...),
    destination_lng: float = Query(...),
    distance_km: float = Query(0.0),
    vehicle_type: str = Query("truck"),
):
    """Return route intelligence with live weather context and traffic/toll estimations."""
    # Midpoint is used to infer route weather for risk scoring.
    mid_lat = (origin_lat + destination_lat) / 2
    mid_lng = (origin_lng + destination_lng) / 2

    weather_context = {
        "temperature_c": None,
        "rain_mm": None,
        "windspeed_kmh": None,
        "source": "fallback",
    }
    try:
        weather_url = (
            "https://api.open-meteo.com/v1/forecast?"
            + urlencode(
                {
                    "latitude": round(mid_lat, 5),
                    "longitude": round(mid_lng, 5),
                    "current": "temperature_2m,rain,wind_speed_10m",
                }
            )
        )
        weather_data = _fetch_json(weather_url)
        current = weather_data.get("current", {})
        weather_context = {
            "temperature_c": _safe_float(current.get("temperature_2m"), 0),
            "rain_mm": _safe_float(current.get("rain"), 0),
            "windspeed_kmh": _safe_float(current.get("wind_speed_10m"), 0),
            "source": "open-meteo",
        }
    except Exception:
        pass

    tomtom_key = os.getenv("TOMTOM_API_KEY", "").strip()
    traffic_factor = 1.0
    traffic_level = "Moderate"
    traffic_source = "heuristic"
    if tomtom_key:
        try:
            tomtom_url = (
                f"https://api.tomtom.com/routing/1/calculateRoute/{origin_lat},{origin_lng}:{destination_lat},{destination_lng}/json?"
                + urlencode({"traffic": "true", "travelMode": "truck", "key": tomtom_key})
            )
            tomtom_data = _fetch_json(tomtom_url)
            summary = (tomtom_data.get("routes") or [{}])[0].get("summary", {})
            no_traffic = _safe_float(summary.get("noTrafficTravelTimeInSeconds"), 0)
            with_traffic = _safe_float(summary.get("travelTimeInSeconds"), 0)
            if no_traffic > 0 and with_traffic > 0:
                traffic_factor = max(1.0, with_traffic / no_traffic)
                traffic_source = "tomtom"
        except Exception:
            traffic_factor = 1.0

    if traffic_source == "heuristic":
        hour = datetime.now().hour
        if 8 <= hour <= 11 or 17 <= hour <= 21:
            traffic_factor += 0.18
        if _safe_float(weather_context.get("rain_mm"), 0) > 1:
            traffic_factor += 0.12
        if _safe_float(weather_context.get("windspeed_kmh"), 0) > 30:
            traffic_factor += 0.07
        if distance_km > 1000:
            traffic_factor += 0.06

    if traffic_factor >= 1.35:
        traffic_level = "Heavy"
    elif traffic_factor >= 1.15:
        traffic_level = "Moderate"
    else:
        traffic_level = "Light"

    per_km_toll = 1.9 if vehicle_type.lower() == "trailer" else 1.55
    toll_estimate = int(max(distance_km, 0) * per_km_toll)

    risk = 28
    if distance_km > 600:
        risk += 16
    if distance_km > 1000:
        risk += 12
    if traffic_level == "Moderate":
        risk += 10
    if traffic_level == "Heavy":
        risk += 18
    if _safe_float(weather_context.get("rain_mm"), 0) > 1:
        risk += 8
    if _safe_float(weather_context.get("windspeed_kmh"), 0) > 30:
        risk += 6
    risk = min(100, max(10, risk))

    recommendations = []
    if traffic_level == "Heavy":
        recommendations.append("Use early morning dispatch window to avoid congestion")
    if _safe_float(weather_context.get("rain_mm"), 0) > 1:
        recommendations.append("Use waterproof tarpaulin and check braking distance")
    if _safe_float(weather_context.get("windspeed_kmh"), 0) > 30:
        recommendations.append("Avoid high-speed segments in open highway stretches")
    if not recommendations:
        recommendations.append("Route conditions are stable for normal dispatch")

    return {
        "status": "success",
        "data": {
            "traffic_level": traffic_level,
            "traffic_factor": round(traffic_factor, 2),
            "traffic_source": traffic_source,
            "toll_estimate": toll_estimate,
            "risk_score": risk,
            "weather": weather_context,
            "recommendations": recommendations,
        },
    }
