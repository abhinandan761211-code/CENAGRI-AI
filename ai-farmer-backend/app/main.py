import os
from dotenv import load_dotenv

# Load environment variables FIRST
load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import Optional
from app.api.routes import auth, storage, transport, buyer, alert, market_price, advisory, quality, ai_assistant, crop_yield, weather, soil, profile, sdg, local_services
from app.services.supabase_state_store import get_dashboard_state_store
from app.services.supabase_db import get_supabase_db
from app.services.weather_service import start_weather_scheduler, stop_weather_scheduler
from app.utils.auth import decode_access_token

app = FastAPI(title="AI Farmer Market API")

# Configure CORS
default_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://localhost:8002",
    "http://127.0.0.1:8002",
]

extra_cors_origins = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS", "").split(","))
    if origin.strip()
]

allowed_cors_origins = list(dict.fromkeys(default_cors_origins + extra_cors_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_cors_origins,
    allow_origin_regex=(
        r"https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress larger JSON responses to reduce transfer size and improve perceived latency.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(storage.router, prefix="/storage", tags=["storage"])
app.include_router(transport.router, prefix="/transport", tags=["transport"])
app.include_router(buyer.router, prefix="/buyers", tags=["buyers"])
app.include_router(alert.router, prefix="/alerts", tags=["alerts"])
app.include_router(market_price.router, prefix="/market-price", tags=["market-price"])
app.include_router(advisory.router, prefix="/advisory", tags=["advisory"])
app.include_router(quality.router, prefix="/quality", tags=["quality"])
app.include_router(ai_assistant.router, prefix="/ai", tags=["ai-assistant"])
app.include_router(crop_yield.router, prefix="/crop-yield", tags=["crop-yield"])
app.include_router(weather.router, prefix="/weather", tags=["weather"])
app.include_router(soil.router, prefix="/soil", tags=["soil"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(sdg.router, prefix="/sdg", tags=["sdg"])
app.include_router(local_services.router, prefix="/local-services", tags=["local-services"])


class DashboardStateUpsertRequest(BaseModel):
    scope: str
    payload: dict


PUBLIC_DASHBOARD_STATE_SCOPES = {
    "home_hero_banner",
}


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


@app.on_event("startup")
def startup_events():
    start_weather_scheduler()


@app.on_event("shutdown")
def shutdown_events():
    stop_weather_scheduler()

@app.get("/")
def root():
    return {"message": "Welcome to AI Farmer Market API"}


@app.get("/health/dashboard-state")
def dashboard_state_health():
    state_store = get_dashboard_state_store()
    return {
        "status": "success",
        "data": state_store.health(),
    }


@app.get("/health/dashboard-state/roundtrip")
def dashboard_state_roundtrip():
    state_store = get_dashboard_state_store()
    result = state_store.roundtrip_test()
    return {
        "status": "success" if result.get("ok") else "warning",
        "data": result,
    }


@app.get("/health/db")
def database_health():
    """Check Supabase database connectivity across all tables."""
    db = get_supabase_db()
    return {
        "status": "success",
        "data": db.health(),
    }


@app.get("/admin/db/dashboard-state/scopes")
def list_dashboard_state_scopes(authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    state_store = get_dashboard_state_store()
    return {
        "status": "success",
        "data": {
            "scopes": state_store.list_scopes(),
            "health": state_store.health(),
        },
    }


@app.get("/admin/db/dashboard-state")
def get_dashboard_state_scope(scope: str, authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    state_store = get_dashboard_state_store()
    payload = state_store.fetch_scope(scope)
    if payload is None:
        return {
            "status": "warning",
            "data": {
                "scope": scope,
                "exists": False,
                "payload": None,
            },
        }
    return {
        "status": "success",
        "data": {
            "scope": scope,
            "exists": True,
            "payload": payload,
        },
    }


@app.get("/dashboard-state/public")
def get_public_dashboard_state_scope(scope: str):
    if scope not in PUBLIC_DASHBOARD_STATE_SCOPES:
        raise HTTPException(status_code=403, detail="Scope is not public")

    state_store = get_dashboard_state_store()
    payload = state_store.fetch_scope(scope)
    if payload is None:
        return {
            "status": "warning",
            "data": {
                "scope": scope,
                "exists": False,
                "payload": None,
            },
        }

    return {
        "status": "success",
        "data": {
            "scope": scope,
            "exists": True,
            "payload": payload,
        },
    }


@app.put("/admin/db/dashboard-state")
def upsert_dashboard_state_scope(body: DashboardStateUpsertRequest, authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    state_store = get_dashboard_state_store()
    payload = state_store.save_state(body.scope, body.payload)
    return {
        "status": "success",
        "data": {
            "scope": body.scope,
            "payload": payload,
        },
    }


@app.delete("/admin/db/dashboard-state")
def delete_dashboard_state_scope(scope: str, authorization: Optional[str] = Header(default=None)):
    _require_admin_user(authorization)
    state_store = get_dashboard_state_store()
    deleted = state_store.delete_scope(scope)
    return {
        "status": "success" if deleted else "warning",
        "data": {
            "scope": scope,
            "deleted": deleted,
        },
    }
