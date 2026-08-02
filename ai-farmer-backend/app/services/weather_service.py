import os
import re
from datetime import datetime
import threading
import time
from typing import Any, Dict, List, Optional

import requests


class WeatherService:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENWEATHER_API_KEY", "")
        self.base_url = os.getenv("OPENWEATHER_BASE_URL", "https://api.openweathermap.org/data/2.5")
        self.onecall_url = os.getenv("OPENWEATHER_ONECALL_URL", "https://api.openweathermap.org/data/3.0/onecall")
        self.geo_url = os.getenv("OPENWEATHER_GEO_URL", "https://api.openweathermap.org/geo/1.0/direct")
        self.sms_webhook_url = os.getenv("SMS_WEBHOOK_URL", "")
        self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.twilio_from_number = os.getenv("TWILIO_FROM_NUMBER", "")

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _parse_lat_lon(self, location: str) -> Optional[Dict[str, float]]:
        text = str(location or "").strip()
        # Supports formats like "18.80711,84.14029" and "18.80711, 84.14029"
        match = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", text)
        if not match:
            return None
        lat = float(match.group(1))
        lon = float(match.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        return {"lat": lat, "lon": lon}

    def _get_coordinates(self, location: str) -> Dict[str, Any]:
        parsed = self._parse_lat_lon(location)
        if parsed:
            return {
                "lat": parsed["lat"],
                "lon": parsed["lon"],
                "name": f"{parsed['lat']:.5f},{parsed['lon']:.5f}",
                "state": "",
                "country": "",
            }

        params = {
            "q": location,
            "limit": 1,
            "appid": self.api_key,
        }
        response = requests.get(self.geo_url, params=params, timeout=15)
        response.raise_for_status()
        payload = response.json() or []
        if not payload:
            raise ValueError(f"Location not found: {location}")

        first = payload[0]
        return {
            "lat": float(first["lat"]),
            "lon": float(first["lon"]),
            "name": str(first.get("name") or location),
            "state": str(first.get("state") or ""),
            "country": str(first.get("country") or ""),
        }

    def _build_weather_risk(self, day: Dict[str, Any]) -> Dict[str, Any]:
        temp_max = float(day.get("temp", {}).get("max", 0) or 0)
        temp_min = float(day.get("temp", {}).get("min", 0) or 0)
        rainfall = float(day.get("rain", 0) or 0)
        humidity = float(day.get("humidity", 0) or 0)
        wind_speed = float(day.get("wind_speed", 0) or 0)

        risk_level = "low"
        labels: List[str] = []

        if rainfall >= 50:
            risk_level = "high"
            labels.append("flood_risk")
        elif rainfall >= 20:
            risk_level = "medium"
            labels.append("heavy_rain")

        if temp_max >= 39:
            risk_level = "high"
            labels.append("heat_stress")
        elif temp_max >= 35:
            if risk_level != "high":
                risk_level = "medium"
            labels.append("high_temperature")

        if rainfall <= 1 and temp_max >= 34:
            if risk_level == "low":
                risk_level = "medium"
            labels.append("drought_signal")

        if wind_speed >= 12:
            if risk_level == "low":
                risk_level = "medium"
            labels.append("strong_wind")

        if humidity >= 90 and temp_min >= 24:
            if risk_level == "low":
                risk_level = "medium"
            labels.append("fungal_disease_risk")

        return {
            "risk_level": risk_level,
            "labels": labels,
            "recommendation": self._recommendation(labels),
            "snapshot": {
                "temp_max": temp_max,
                "temp_min": temp_min,
                "rainfall_mm": rainfall,
                "humidity": humidity,
                "wind_speed": wind_speed,
            },
        }

    def _open_meteo_coordinates(self, location: str) -> Dict[str, Any]:
        parsed = self._parse_lat_lon(location)
        if parsed:
            return {
                "lat": parsed["lat"],
                "lon": parsed["lon"],
                "name": f"{parsed['lat']:.5f},{parsed['lon']:.5f}",
                "state": "",
                "country": "",
            }

        query = location.split(",")[0].strip() if "," in location else location
        response = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": query, "count": 1, "language": "en", "format": "json"},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json() or {}
        results = payload.get("results", [])
        if not results:
            raise ValueError(f"Location not found: {location}")

        first = results[0]
        return {
            "lat": float(first.get("latitude", 0)),
            "lon": float(first.get("longitude", 0)),
            "name": str(first.get("name") or location),
            "state": str(first.get("admin1") or ""),
            "country": str(first.get("country") or ""),
        }

    def _open_meteo_forecast(self, location: str, days: int = 7) -> Dict[str, Any]:
        coords = self._open_meteo_coordinates(location)
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": coords["lat"],
                "longitude": coords["lon"],
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
                "forecast_days": max(1, min(days, 10)),
                "timezone": "auto",
            },
            timeout=20,
        )
        response.raise_for_status()
        data = response.json() or {}
        daily = data.get("daily", {})

        dates = daily.get("time", [])
        tmax = daily.get("temperature_2m_max", [])
        tmin = daily.get("temperature_2m_min", [])
        rain = daily.get("precipitation_sum", [])
        wind = daily.get("wind_speed_10m_max", [])

        normalized = []
        for idx, date_str in enumerate(dates):
            item = {
                "temp": {
                    "max": float(tmax[idx] if idx < len(tmax) else 0),
                    "min": float(tmin[idx] if idx < len(tmin) else 0),
                    "day": float(tmax[idx] if idx < len(tmax) else 0),
                    "night": float(tmin[idx] if idx < len(tmin) else 0),
                },
                "rain": float(rain[idx] if idx < len(rain) else 0),
                "humidity": 0,
                "wind_speed": float(wind[idx] if idx < len(wind) else 0),
            }
            risk = self._build_weather_risk(item)
            normalized.append(
                {
                    "date": date_str,
                    "summary": "forecast",
                    "icon": "na",
                    "temperature": item["temp"],
                    "humidity": 0,
                    "wind_speed": item["wind_speed"],
                    "rainfall_mm": item["rain"],
                    "clouds": 0,
                    "risk": risk,
                }
            )

        high_risk_days = [d for d in normalized if d.get("risk", {}).get("risk_level") == "high"]
        medium_risk_days = [d for d in normalized if d.get("risk", {}).get("risk_level") == "medium"]

        return {
            "provider": "open-meteo-fallback",
            "location": {
                "query": location,
                "name": coords["name"],
                "state": coords["state"],
                "country": coords["country"],
                "lat": coords["lat"],
                "lon": coords["lon"],
            },
            "forecast_days": len(normalized),
            "units": "metric",
            "daily_forecast": normalized,
            "risk_summary": {
                "high_risk_days": len(high_risk_days),
                "medium_risk_days": len(medium_risk_days),
                "advisory": (
                    "High weather risk in upcoming days. Trigger proactive alerts and field-level mitigation."
                    if high_risk_days
                    else "No extreme event detected. Keep daily weather watch active."
                ),
            },
        }

    def _recommendation(self, labels: List[str]) -> str:
        if "flood_risk" in labels:
            return "Ensure field drainage channels are open and delay fertilizer broadcast before heavy rainfall."
        if "drought_signal" in labels:
            return "Prioritize irrigation scheduling, mulching, and moisture conservation in vulnerable plots."
        if "heat_stress" in labels:
            return "Use early-morning irrigation and crop canopy protection to reduce heat stress."
        if "fungal_disease_risk" in labels:
            return "Increase fungal scouting and preventive bio-fungicide coverage in humid fields."
        if "strong_wind" in labels:
            return "Secure stakes/nets and avoid foliar spray during high-wind windows."
        return "No major weather threat. Continue routine monitoring and field scouting."

    def get_forecast(self, location: str, days: int = 7, units: str = "metric") -> Dict[str, Any]:
        if not self.available:
            return self._open_meteo_forecast(location=location, days=days)

        days = max(1, min(days, 10))
        try:
            coords = self._get_coordinates(location)
        except Exception:
            return self._open_meteo_forecast(location=location, days=days)

        params = {
            "lat": coords["lat"],
            "lon": coords["lon"],
            "exclude": "minutely,hourly,alerts",
            "units": units,
            "appid": self.api_key,
        }

        response = requests.get(self.onecall_url, params=params, timeout=20)
        if response.status_code >= 400:
            return self._open_meteo_forecast(location=location, days=days)

        data = response.json() or {}
        daily = data.get("daily", [])

        if not daily:
            raise ValueError("Weather forecast data unavailable for this location.")

        sliced = daily[: min(days, len(daily))]
        normalized = []

        for item in sliced:
            dt_value = int(item.get("dt", 0) or 0)
            date_str = datetime.utcfromtimestamp(dt_value).strftime("%Y-%m-%d")
            weather = item.get("weather", [{}])[0]
            risk = self._build_weather_risk(item)

            normalized.append(
                {
                    "date": date_str,
                    "summary": str(weather.get("description") or "clear"),
                    "icon": str(weather.get("icon") or "01d"),
                    "temperature": {
                        "min": float(item.get("temp", {}).get("min", 0) or 0),
                        "max": float(item.get("temp", {}).get("max", 0) or 0),
                        "day": float(item.get("temp", {}).get("day", 0) or 0),
                        "night": float(item.get("temp", {}).get("night", 0) or 0),
                    },
                    "humidity": float(item.get("humidity", 0) or 0),
                    "wind_speed": float(item.get("wind_speed", 0) or 0),
                    "rainfall_mm": float(item.get("rain", 0) or 0),
                    "clouds": float(item.get("clouds", 0) or 0),
                    "risk": risk,
                }
            )

        high_risk_days = [d for d in normalized if d.get("risk", {}).get("risk_level") == "high"]
        medium_risk_days = [d for d in normalized if d.get("risk", {}).get("risk_level") == "medium"]

        return {
            "provider": "openweather",
            "location": {
                "query": location,
                "name": coords["name"],
                "state": coords["state"],
                "country": coords["country"],
                "lat": coords["lat"],
                "lon": coords["lon"],
            },
            "forecast_days": len(normalized),
            "units": units,
            "daily_forecast": normalized,
            "risk_summary": {
                "high_risk_days": len(high_risk_days),
                "medium_risk_days": len(medium_risk_days),
                "advisory": (
                    "High weather risk in upcoming days. Trigger proactive alerts and field-level mitigation."
                    if high_risk_days
                    else "No extreme event detected. Keep daily weather watch active."
                ),
            },
        }

    def trigger_sms_notification(self, phone: str, message: str) -> Dict[str, Any]:
        if self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number:
            try:
                twilio_url = (
                    f"https://api.twilio.com/2010-04-01/Accounts/"
                    f"{self.twilio_account_sid}/Messages.json"
                )
                response = requests.post(
                    twilio_url,
                    data={
                        "To": phone,
                        "From": self.twilio_from_number,
                        "Body": message,
                    },
                    auth=(self.twilio_account_sid, self.twilio_auth_token),
                    timeout=12,
                )
                return {
                    "sent": response.status_code < 300,
                    "status_code": response.status_code,
                    "provider": "twilio",
                }
            except Exception as exc:
                return {
                    "sent": False,
                    "provider": "twilio",
                    "error": str(exc),
                }

        # If webhook is configured, integrate with SMS provider. Otherwise simulate success.
        if self.sms_webhook_url:
            try:
                response = requests.post(
                    self.sms_webhook_url,
                    json={"phone": phone, "message": message},
                    timeout=10,
                )
                return {
                    "sent": response.status_code < 300,
                    "status_code": response.status_code,
                    "provider": "webhook",
                }
            except Exception as exc:
                return {
                    "sent": False,
                    "provider": "webhook",
                    "error": str(exc),
                }

        return {
            "sent": True,
            "provider": "simulated",
            "note": "No SMS_WEBHOOK_URL set; simulated notification only.",
        }


_subscribers: List[Dict[str, Any]] = []
_service: Optional[WeatherService] = None
_scheduler_thread: Optional[threading.Thread] = None
_scheduler_stop = threading.Event()
_last_scheduler_run_date = ""


def _risk_threshold_value(level: str) -> int:
    risk_order = {"low": 1, "medium": 2, "high": 3}
    return risk_order.get(str(level).lower(), 2)


def _collect_risky_days(forecast: Dict[str, Any], min_risk: str) -> List[Dict[str, Any]]:
    threshold = _risk_threshold_value(min_risk)
    risk_order = {"low": 1, "medium": 2, "high": 3}
    return [
        day
        for day in forecast.get("daily_forecast", [])
        if risk_order.get(day.get("risk", {}).get("risk_level", "low"), 1) >= threshold
    ]


def run_daily_weather_alert_job() -> Dict[str, Any]:
    service = get_weather_service()
    if not _subscribers:
        return {"status": "ok", "subscribers": 0, "notifications": 0}

    window_days = int(os.getenv("WEATHER_ALERT_WINDOW_DAYS", "7") or 7)
    location_map: Dict[str, List[Dict[str, Any]]] = {}
    notifications_sent = 0

    for sub in _subscribers:
        location = str(sub.get("location") or "").strip()
        if not location:
            continue
        location_map.setdefault(location, []).append(sub)

    for location, subscribers in location_map.items():
        try:
            forecast = service.get_forecast(location=location, days=window_days)
        except Exception:
            continue

        for sub in subscribers:
            risky_days = _collect_risky_days(forecast, str(sub.get("risk_level") or "medium"))
            if not risky_days:
                continue

            message = (
                f"Weather alert for {location}: {len(risky_days)} risk day(s) in next {window_days} days. "
                f"Advisory: {forecast.get('risk_summary', {}).get('advisory', '')}"
            )
            status = service.trigger_sms_notification(str(sub.get("phone") or ""), message)
            if status.get("sent"):
                notifications_sent += 1

    return {
        "status": "ok",
        "subscribers": len(_subscribers),
        "notifications": notifications_sent,
    }


def _scheduler_loop() -> None:
    global _last_scheduler_run_date

    hour = int(os.getenv("WEATHER_ALERT_HOUR_24", "6") or 6)
    minute = int(os.getenv("WEATHER_ALERT_MINUTE", "0") or 0)

    while not _scheduler_stop.is_set():
        now = datetime.now()
        run_date = now.strftime("%Y-%m-%d")

        if now.hour == hour and now.minute == minute and run_date != _last_scheduler_run_date:
            run_daily_weather_alert_job()
            _last_scheduler_run_date = run_date

        _scheduler_stop.wait(30)


def get_weather_service() -> WeatherService:
    global _service
    if _service is None:
        _service = WeatherService()
    return _service


def add_weather_subscriber(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        **payload,
        "id": len(_subscribers) + 1,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    _subscribers.append(payload)
    return payload


def list_weather_subscribers() -> List[Dict[str, Any]]:
    return _subscribers


def start_weather_scheduler() -> Dict[str, Any]:
    global _scheduler_thread
    enabled = str(os.getenv("WEATHER_ALERT_SCHEDULER_ENABLED", "false")).lower() == "true"
    if not enabled:
        return {"enabled": False, "running": False}

    if _scheduler_thread and _scheduler_thread.is_alive():
        return {"enabled": True, "running": True}

    _scheduler_stop.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True)
    _scheduler_thread.start()
    return {"enabled": True, "running": True}


def stop_weather_scheduler() -> Dict[str, Any]:
    _scheduler_stop.set()
    return {"stopped": True}


def weather_scheduler_status() -> Dict[str, Any]:
    enabled = str(os.getenv("WEATHER_ALERT_SCHEDULER_ENABLED", "false")).lower() == "true"
    running = bool(_scheduler_thread and _scheduler_thread.is_alive())
    return {
        "enabled": enabled,
        "running": running,
        "hour": int(os.getenv("WEATHER_ALERT_HOUR_24", "6") or 6),
        "minute": int(os.getenv("WEATHER_ALERT_MINUTE", "0") or 0),
        "window_days": int(os.getenv("WEATHER_ALERT_WINDOW_DAYS", "7") or 7),
        "last_run_date": _last_scheduler_run_date,
    }
