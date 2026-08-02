from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.market_price_service import fetch_live_mandi_prices
from app.services.sarvam_service import get_sarvam_service
from app.services.supabase_state_store import get_dashboard_state_store
from app.services.weather_service import get_weather_service

router = APIRouter()
ALERT_SCOPE = "price_alerts_v1"
state_store = get_dashboard_state_store()


class SetAlertPayload(BaseModel):
    crop_name: str = Field(..., min_length=1)
    market: str = ""
    condition: str = "above"
    target_price: Optional[float] = None
    price_threshold: Optional[float] = None
    language: str = "en"
    notify_sms: bool = False
    notify_browser: bool = True
    phone: Optional[str] = ""
    user_id: Optional[str] = ""
    user_email: Optional[str] = ""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_condition(value: str) -> str:
    normalized = str(value or "above").strip().lower()
    return "below" if normalized == "below" else "above"


def _resolve_user_ref(user_id: Optional[str], user_email: Optional[str]) -> str:
    clean_id = str(user_id or "").strip()
    clean_email = str(user_email or "").strip().lower()
    if clean_id:
      return f"id:{clean_id}"
    if clean_email:
      return f"email:{clean_email}"
    return "guest"


def _default_state() -> Dict[str, Any]:
    return {"next_id": 1, "alerts": []}


def _load_state() -> Dict[str, Any]:
    state = state_store.get_state(ALERT_SCOPE, _default_state())
    if not isinstance(state, dict):
      return _default_state()
    if "alerts" not in state or not isinstance(state.get("alerts"), list):
      state["alerts"] = []
    if "next_id" not in state:
      state["next_id"] = (max([int(a.get("id") or 0) for a in state["alerts"]] or [0]) + 1)
    return state


def _save_state(state: Dict[str, Any]) -> None:
    state_store.save_state(ALERT_SCOPE, state)


def _estimate_current_price(crop_name: str, market: str = "") -> float:
    crop = str(crop_name or "").strip()
    if not crop:
      return 0.0

    rows = fetch_live_mandi_prices(limit=140, commodity=crop)
    if not rows:
      return 0.0

    market_query = str(market or "").strip().lower()
    matched = []
    fallback = []
    for row in rows:
      try:
        price_val = float(row.get("price") or row.get("modal_price") or 0)
      except Exception:
        price_val = 0.0
      if price_val <= 0:
        continue

      fallback.append(price_val)
      market_name = str(row.get("market") or "").lower()
      state_name = str(row.get("state") or "").lower()
      if market_query and (market_query in market_name or market_query in state_name):
        matched.append(price_val)

    bucket = matched if matched else fallback
    if not bucket:
      return 0.0
    return round(sum(bucket) / len(bucket), 2)


def _check_trigger(condition: str, current_price: float, target_price: float) -> bool:
    if target_price <= 0:
      return False
    if condition == "below":
      return current_price <= target_price
    return current_price >= target_price


def _format_alert_message(alert: Dict[str, Any], current_price: float) -> str:
    condition_text = "above" if alert.get("condition") == "above" else "below"
    return (
      f"Price Alert: {alert.get('crop_name')} in {alert.get('market') or 'target market'} is "
      f"INR {round(current_price, 2)} ({condition_text} INR {round(float(alert.get('target_price') or 0), 2)})."
    )

@router.post("/set")
def set_alert(payload: SetAlertPayload):
    target = float(payload.target_price or payload.price_threshold or 0)
    if target <= 0:
        raise HTTPException(status_code=400, detail="target_price must be greater than 0")

    state = _load_state()
    alert_id = int(state.get("next_id") or 1)
    user_ref = _resolve_user_ref(payload.user_id, payload.user_email)

    alert = {
        "id": alert_id,
        "user_ref": user_ref,
        "user_id": str(payload.user_id or "").strip(),
        "user_email": str(payload.user_email or "").strip().lower(),
        "crop_name": payload.crop_name.strip(),
        "market": str(payload.market or "").strip(),
        "condition": _normalize_condition(payload.condition),
        "target_price": round(target, 2),
        "language": str(payload.language or "en").strip().lower(),
        "notify_sms": bool(payload.notify_sms),
        "notify_browser": bool(payload.notify_browser),
        "phone": str(payload.phone or "").strip(),
        "status": "active",
        "trigger_count": 0,
        "last_checked_price": None,
        "last_checked_at": None,
        "last_triggered_at": None,
        "created_at": _utc_now(),
        "updated_at": _utc_now(),
    }

    state["alerts"] = [alert, *state.get("alerts", [])]
    state["next_id"] = alert_id + 1
    _save_state(state)

    return {"status": "success", "data": alert}


@router.get("/list")
def list_alerts(
    user_id: str = Query("", description="User id"),
    user_email: str = Query("", description="User email"),
):
    user_ref = _resolve_user_ref(user_id, user_email)
    state = _load_state()
    alerts = [item for item in state.get("alerts", []) if item.get("user_ref") == user_ref]
    return {"status": "success", "data": alerts}


@router.delete("/{alert_id}")
def delete_alert(
    alert_id: int,
    user_id: str = Query("", description="User id"),
    user_email: str = Query("", description="User email"),
):
    user_ref = _resolve_user_ref(user_id, user_email)
    state = _load_state()
    before = len(state.get("alerts", []))
    state["alerts"] = [
        item
        for item in state.get("alerts", [])
        if not (int(item.get("id") or -1) == alert_id and item.get("user_ref") == user_ref)
    ]

    if len(state["alerts"]) == before:
        raise HTTPException(status_code=404, detail="Alert not found")

    _save_state(state)
    return {"status": "success", "detail": "Alert deleted"}


@router.post("/check")
def check_alerts(
    user_id: str = Query("", description="User id"),
    user_email: str = Query("", description="User email"),
    send_sms: bool = Query(False, description="Trigger SMS when configured"),
):
    user_ref = _resolve_user_ref(user_id, user_email)
    state = _load_state()
    updated: List[Dict[str, Any]] = []
    triggered: List[Dict[str, Any]] = []
    checked = 0

    weather_service = get_weather_service()
    all_alerts = state.get("alerts", [])

    for item in all_alerts:
        if item.get("user_ref") != user_ref:
            updated.append(item)
            continue

        if str(item.get("status") or "active") != "active":
            updated.append(item)
            continue

        checked += 1
        current_price = _estimate_current_price(item.get("crop_name", ""), item.get("market", ""))
        is_triggered = _check_trigger(
            str(item.get("condition") or "above"),
            float(current_price or 0),
            float(item.get("target_price") or 0),
        )

        item["last_checked_price"] = current_price
        item["last_checked_at"] = _utc_now()
        item["updated_at"] = _utc_now()

        if is_triggered:
            item["trigger_count"] = int(item.get("trigger_count") or 0) + 1
            item["last_triggered_at"] = _utc_now()
            message = _format_alert_message(item, current_price)

            sms_status = {"status": "skipped", "note": "SMS disabled"}
            if send_sms and bool(item.get("notify_sms")) and str(item.get("phone") or "").strip():
                sms_status = weather_service.trigger_sms_notification(str(item.get("phone")), message)

            triggered.append(
                {
                    "alert_id": item.get("id"),
                    "crop_name": item.get("crop_name"),
                    "market": item.get("market"),
                    "current_price": current_price,
                    "target_price": item.get("target_price"),
                    "condition": item.get("condition"),
                    "message": message,
                    "notify_browser": bool(item.get("notify_browser")),
                    "notify_sms": bool(item.get("notify_sms")),
                    "sms_status": sms_status,
                }
            )

        updated.append(item)

    state["alerts"] = updated
    _save_state(state)

    return {
        "status": "success",
        "data": {
            "checked": checked,
            "triggered_count": len(triggered),
            "triggered": triggered,
            "timestamp": _utc_now(),
        },
    }


@router.get("/suggest-thresholds")
def suggest_thresholds(
    crop: str = Query(..., description="Crop name"),
    market: str = Query("", description="Market name"),
    days: int = Query(7, description="Volatility window in days"),
    current_price: float = Query(0, description="Current market price"),
    language: str = Query("en", description="Language code"),
):
    service = get_sarvam_service()
    suggestion = service.suggest_price_thresholds(
        crop=crop,
        market=market,
        days=days,
        current_price=current_price or None,
        language=language,
    )
    return {
        "status": "success",
        "data": {
            "crop": crop,
            "market": market,
            "window_days": days,
            **suggestion,
        },
    }
