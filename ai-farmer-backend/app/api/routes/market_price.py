from fastapi import APIRouter, Query
from app.services.market_price_service import (
    fetch_live_mandi_prices,
    get_market_dashboard_data,
    fetch_google_market_updates,
    fetch_google_trends_demand_score,
    build_google_demand_forecast_7d,
    get_historical_dataset_df,
)
from app.services.sarvam_service import get_sarvam_service
from app.services.price_predictor import get_price_prediction_service
from pydantic import BaseModel
from typing import Any, List, Optional
import os
import json
import requests

try:
    import google.genai as genai
except Exception:
    genai = None

router = APIRouter()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY") or os.getenv("OPENAI_API_KEY")
MARKET_AI_SESSION = requests.Session()


def _clean_ai_text(text: str) -> str:
    cleaned = (text or "").strip()
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>", 1)[1].strip()
    if cleaned.startswith("<think>"):
        cleaned = cleaned.replace("<think>", "", 1).strip()
    return cleaned


def _market_ai_prompt(crop_type: str, dashboard: dict, language: str) -> str:
    summary = dashboard.get("summary", {})
    top_markets = dashboard.get("top_markets", [])[:3]
    top_commodities = dashboard.get("top_commodities", [])[:5]

    markets_text = ", ".join(
        f"{m.get('market', 'N/A')} ({m.get('state', 'N/A')}) avg ₹{m.get('avg_price', 0)}"
        for m in top_markets
    ) or "N/A"
    commodities_text = ", ".join(
        f"{c.get('commodity', 'N/A')} avg ₹{c.get('avg_price', 0)}"
        for c in top_commodities
    ) or "N/A"

    if language == "hi":
        return (
            "आप एक एग्री-मार्केट विशेषज्ञ हैं। नीचे दिए गए मंडी डेटा के आधार पर संक्षिप्त, actionable विश्लेषण दें।\n"
            f"फ़सल फ़ोकस: {crop_type}\n"
            f"कुल रिकॉर्ड: {summary.get('records', 0)}\n"
            f"औसत कीमत: ₹{summary.get('avg_modal_price', 0)}\n"
            f"मूवमेंट: बढ़त={summary.get('movement_up', 0)}, गिरावट={summary.get('movement_down', 0)}, स्थिर={summary.get('movement_stable', 0)}\n"
            f"शीर्ष बाजार: {markets_text}\n"
            f"शीर्ष कमोडिटी: {commodities_text}\n\n"
            "4 बुलेट में जवाब दें: (1) ट्रेंड सारांश (2) बेचने का सही समय (3) जोखिम (4) 7 दिन की रणनीति।"
        )

    return (
        "You are an agri-market expert. Analyze the mandi dashboard snapshot and provide concise actionable guidance.\n"
        f"Crop focus: {crop_type}\n"
        f"Total records: {summary.get('records', 0)}\n"
        f"Average price: ₹{summary.get('avg_modal_price', 0)}\n"
        f"Movement: up={summary.get('movement_up', 0)}, down={summary.get('movement_down', 0)}, stable={summary.get('movement_stable', 0)}\n"
        f"Top markets: {markets_text}\n"
        f"Top commodities: {commodities_text}\n\n"
        "Respond in 4 bullet points: (1) trend snapshot (2) best selling window (3) risks (4) 7-day action plan."
    )


def _get_market_dashboard_ai_insights(crop_type: str, dashboard: dict, language: str) -> dict:
    prompt = _market_ai_prompt(crop_type, dashboard, language)

    if SARVAM_API_KEY:
        try:
            payload = {
                "model": "sarvam-m",
                "messages": [
                    {"role": "system", "content": "You are an agricultural market advisor."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 420,
            }
            headers = {
                "Authorization": f"Bearer {SARVAM_API_KEY}",
                "api-subscription-key": SARVAM_API_KEY,
                "Content-Type": "application/json",
            }
            response = MARKET_AI_SESSION.post(
                "https://api.sarvam.ai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=20,
            )
            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices", [])
                if choices and choices[0].get("message", {}).get("content"):
                    return {
                        "text": _clean_ai_text(choices[0]["message"]["content"]),
                        "source": "sarvam",
                        "language": language,
                    }
        except Exception:
            pass

    if GEMINI_API_KEY and genai:
        try:
            client = genai.Client(api_key=GEMINI_API_KEY)
            response = client.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=prompt,
            )
            if response and response.text:
                return {
                    "text": _clean_ai_text(response.text),
                    "source": "gemini_fallback",
                    "language": language,
                }
        except Exception:
            pass

    default_hi = "डेटा के अनुसार कीमतों में उतार-चढ़ाव है। अभी चरणबद्ध बिक्री रखें, 2-3 मंडियों की तुलना करें, और अगले 7 दिनों में मजबूत मांग वाले बाजार में डिस्पैच बढ़ाएं।"
    default_en = "Market prices are volatile. Use phased selling, compare 2-3 mandis before dispatch, and prioritize markets showing sustained demand over the next 7 days."

    return {
        "text": default_hi if language == "hi" else default_en,
        "source": "rules_fallback",
        "language": language,
    }


def _build_market_opportunities(dashboard: dict, language: str) -> list[dict]:
    top_markets = dashboard.get("top_markets", [])[:3]
    opportunities: list[dict] = []

    for item in top_markets:
        market_name = item.get("market", "Unknown")
        state_name = item.get("state", "Unknown")
        avg_price = float(item.get("avg_price", 0) or 0)
        samples = int(item.get("samples", 0) or 0)
        trend = str(item.get("trend", "stable"))

        if language == "hi":
            title = f"{market_name}, {state_name}"
            reason = (
                f"औसत भाव ₹{round(avg_price, 2)} और {samples} रिकॉर्ड।"
                f" ट्रेंड: {'बढ़त' if trend == 'up' else 'गिरावट' if trend == 'down' else 'स्थिर'}"
            )
        else:
            title = f"{market_name}, {state_name}"
            reason = (
                f"Avg price ₹{round(avg_price, 2)} across {samples} records. "
                f"Trend: {trend}."
            )

        opportunity_score = min(100, max(45, round((avg_price / 100) + (samples * 2))))
        opportunities.append(
            {
                "market": market_name,
                "state": state_name,
                "title": title,
                "avg_price": round(avg_price, 2),
                "trend": trend,
                "samples": samples,
                "opportunity_score": opportunity_score,
                "reason": reason,
            }
        )

    return opportunities


def _build_trading_signals(dashboard: dict, language: str) -> list[dict]:
    summary = dashboard.get("summary", {})
    up = int(summary.get("movement_up", 0) or 0)
    down = int(summary.get("movement_down", 0) or 0)
    stable = int(summary.get("movement_stable", 0) or 0)
    avg_price = float(summary.get("avg_modal_price", 0) or 0)

    signals: list[dict] = []

    if up > down + 3:
        signal_type = "sell"
        confidence = min(95, 60 + ((up - down) * 3))
    elif down > up + 3:
        signal_type = "buy"
        confidence = min(95, 60 + ((down - up) * 3))
    else:
        signal_type = "hold"
        confidence = min(90, 58 + stable)

    if language == "hi":
        labels = {
            "buy": "BUY: खरीदें",
            "hold": "HOLD: रोककर रखें",
            "sell": "SELL: बेचें",
        }
        primary_reason = (
            f"मंडी मूवमेंट बैलेंस: बढ़त={up}, गिरावट={down}, स्थिर={stable}. "
            f"औसत भाव ₹{round(avg_price, 2)}"
        )
    else:
        labels = {
            "buy": "BUY",
            "hold": "HOLD",
            "sell": "SELL",
        }
        primary_reason = (
            f"Movement balance: up={up}, down={down}, stable={stable}. "
            f"Average price ₹{round(avg_price, 2)}"
        )

    signals.append(
        {
            "signal": signal_type,
            "label": labels.get(signal_type, signal_type.upper()),
            "confidence": round(confidence, 1),
            "reason": primary_reason,
        }
    )

    if language == "hi":
        signals.append(
            {
                "signal": "risk",
                "label": "जोखिम",
                "confidence": round(max(40, 100 - confidence), 1),
                "reason": "डिस्पैच से पहले 2-3 मंडियों की तुलना करें और चरणबद्ध बिक्री रखें।",
            }
        )
    else:
        signals.append(
            {
                "signal": "risk",
                "label": "RISK",
                "confidence": round(max(40, 100 - confidence), 1),
                "reason": "Compare 2-3 mandis before dispatch and use phased selling.",
            }
        )

    return signals


@router.get("/")
def get_live_prices(
    limit: int = Query(80, ge=10, le=500, description="Number of mandi rows to return"),
    offset: int = Query(0, ge=0, description="Pagination offset for mandi rows"),
    force_refresh: bool = Query(False, description="Bypass cache and fetch fresh mandi data"),
    commodity: Optional[str] = Query(None, description="Filter by commodity/crop name"),
    state: Optional[str] = Query(None, description="Filter by state name"),
):
    """
    Get live market prices for all commodities from Mandi API.
    Supports optional commodity and state filters for targeted queries.
    """
    prices = fetch_live_mandi_prices(
        limit=limit,
        force_refresh=force_refresh,
        offset=offset,
        commodity=commodity or None,
        state=state or None,
    )
    response_source = "India Mandi API"
    if prices:
        first_source = str(prices[0].get("source", "") or "").strip().lower()
        if first_source == "historical_dataset":
            response_source = "Historical dataset fallback"
    else:
        response_source = "No data available"

    return {
        "status": "success",
        "data": prices,
        "count": len(prices),
        "offset": offset,
        "limit": limit,
        "has_more": len(prices) == limit,
        "source": response_source
    }


@router.get("/ai-search")
def ai_search_mandi(
    query: str = Query(..., description="Natural language mandi search query"),
    language: str = Query("en", description="Language code"),
    limit: int = Query(50, description="Result limit"),
):
    from app.services.market_price_service import _fetch_raw_mandi_records, _prepare_live_price_rows
    service = get_sarvam_service()
    parsed = service.parse_market_search_query(query)

    commodity = (parsed.get("commodity") or "").strip()
    state = (parsed.get("state") or "").strip()
    market = (parsed.get("market") or "").strip()

    # Fetch from the upstream API WITH filters so we are not searching a tiny 200-record sample
    raw = _fetch_raw_mandi_records(
        limit=min(max(limit * 3, 150), 500),
        commodity=commodity or None,
        state=state or None,
        market=market or None,
    )
    prices = _prepare_live_price_rows(raw.get("records", []), limit=limit)

    # Soft fallback: if API returned 0 for the filtered query, broaden to state-only search
    if not prices and (commodity or market) and state:
        raw_broad = _fetch_raw_mandi_records(
            limit=min(limit * 4, 500),
            state=state or None,
        )
        prices = _prepare_live_price_rows(raw_broad.get("records", []), limit=limit)

    filtered = prices[: max(1, min(limit, 500))]

    summary_text = (
        f"Found {len(filtered)} results for '{query}'."
        if language != "hi"
        else f"'{query}' के लिए {len(filtered)} मंडी रिकॉर्ड मिले।"
    )

    return {
        "status": "success",
        "query": query,
        "parsed": parsed,
        "summary": summary_text,
        "count": len(filtered),
        "data": filtered,
    }


@router.post("/predict")
def predict_commodity_price(
    crop_name: str = Query(..., description="Name of the crop"),
    state: Optional[str] = Query("Maharashtra", description="State or area name for prediction"),
    quantity: float = Query(..., description="Quantity in quintals"),
    month: Optional[int] = Query(None, description="Month number (1-12) for prediction"),
    market: Optional[str] = Query(None, description="Specific market or area name"),
    language: str = Query("en", description="Language: en, hi")
):
    """
    Predict future price for a commodity based on trained data.
    Options: month and market/area can be supplied to refine prediction.
    """
    from app.services.price_predictor import get_price_prediction_service

    service = get_price_prediction_service()
    prediction: dict[str, Any] = service.predict_price(
        crop_name,
        state or (market or ""),
        month=month,
        market=market,
        years_ahead=1
    )

    # add quantity-based totals for UI convenience
    if isinstance(prediction, dict) and "predictions" in prediction and isinstance(prediction["predictions"], list) and prediction["predictions"]:
        first_pred = prediction["predictions"][0]
        if isinstance(first_pred, dict):
            predicted_price = first_pred.get("predicted_price")
            if predicted_price is not None:
                # Ensure all values are JSON serializable and types are correct
                prediction["quantity"] = str(quantity)
                prediction["total_value"] = str(round(float(predicted_price) * float(quantity), 2))
                prediction["price_range"] = {
                    "min": round(float(predicted_price) * 0.9, 2),
                    "max": round(float(predicted_price) * 1.1, 2)
                }

    return {
        "status": "success" if isinstance(prediction, dict) else "error",
        "data": prediction
    }


@router.get("/supported")
def get_supported_commodities():
    """Return supported commodities, states, months and markets from the trained model."""
    service = get_price_prediction_service()
    supported = service.get_supported_commodities()

    # Add dataset years so the frontend can query historical endpoints safely.
    try:
        df = get_historical_dataset_df()
        years_series = df.get("__year_int")
        if years_series is None:
            years = []
        else:
            years = sorted(
                int(year)
                for year in years_series.dropna().astype(int).unique().tolist()
            )
    except Exception:
        years = []

    supported["years"] = years

    return {
        "status": "success",
        "data": supported
    }


@router.get("/commodity/{commodity_name}")
def get_commodity_price(commodity_name: str):
    """
    Get prices for a specific commodity from all markets
    """
    all_prices = fetch_live_mandi_prices()
    commodity_prices = [
        p for p in all_prices 
        if p["commodity"].lower() == commodity_name.lower()
    ]
    
    if not commodity_prices:
        return {
            "status": "not_found",
            "data": [],
            "message": f"No prices found for {commodity_name}"
        }
    
    return {
        "status": "success",
        "data": commodity_prices,
        "count": len(commodity_prices),
        "commodity": commodity_name
    }


@router.get("/market/{market_name}")
def get_market_prices(market_name: str):
    """
    Get all commodity prices from a specific market
    """
    all_prices = fetch_live_mandi_prices()
    market_prices = [
        p for p in all_prices 
        if p["market"].lower() == market_name.lower()
    ]
    
    if not market_prices:
        return {
            "status": "not_found",
            "data": [],
            "message": f"No prices found for market: {market_name}"
        }
    
    return {
        "status": "success",
        "data": market_prices,
        "count": len(market_prices),
        "market": market_name
    }


# --- New Endpoints for Historical and Market Rates ---

@router.get("/historical")
def get_historical_prices(
    crop_name: str = Query(..., description="Name of the crop"),
    state: str = Query(..., description="State name"),
    market: str = Query(..., description="Market name"),
    month: int = Query(..., description="Month number (1-12)"),
    year: int = Query(..., description="Year (e.g., 2022)"),
):
    """Return historical price for a crop in a given market, state, month, and year from the CSV dataset."""
    try:
        df = get_historical_dataset_df()
        if df.empty:
            return {"status": "not_found", "data": [], "message": "Historical dataset is empty."}

        crop_lc = crop_name.lower().strip()
        state_lc = state.lower().strip()
        market_lc = market.lower().strip()

        filtered = df[
            (df["__crop_lc"] == crop_lc) &
            (df["__state_lc"] == state_lc) &
            (df["__market_lc"] == market_lc) &
            (df["__month_int"] == int(month)) &
            (df["__year_int"] == int(year))
        ]
        if filtered.empty:
            return {"status": "not_found", "data": [], "message": "No historical data found for the given parameters."}

        clean_filtered = filtered.drop(
            columns=[col for col in ["__crop_lc", "__state_lc", "__market_lc", "__month_int", "__year_int", "__date_sort"] if col in filtered.columns],
            errors="ignore",
        )
        try:
            result = json.loads(clean_filtered.to_json(orient="records"))
        except Exception:
            result = []
        return {"status": "success", "data": result, "count": len(result)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/market-rates")
def get_market_rates(
    crop_name: str = Query(..., description="Name of the crop"),
    state: str = Query(..., description="State name"),
    market: str = Query(..., description="Market name"),
    month: int = Query(..., description="Month number (1-12)"),
):
    """Return all available market rates for a crop in a given market, state, and month from the CSV dataset."""
    try:
        df = get_historical_dataset_df()
        if df.empty:
            return {"status": "not_found", "data": [], "message": "Historical dataset is empty."}

        crop_lc = crop_name.lower().strip()
        state_lc = state.lower().strip()
        market_lc = market.lower().strip()

        filtered = df[
            (df["__crop_lc"] == crop_lc) &
            (df["__state_lc"] == state_lc) &
            (df["__market_lc"] == market_lc) &
            (df["__month_int"] == int(month))
        ]
        if filtered.empty:
            return {"status": "not_found", "data": [], "message": "No market rates found for the given parameters."}

        clean_filtered = filtered.drop(
            columns=[col for col in ["__crop_lc", "__state_lc", "__market_lc", "__month_int", "__year_int", "__date_sort"] if col in filtered.columns],
            errors="ignore",
        )
        try:
            result = json.loads(clean_filtered.to_json(orient="records"))
        except Exception:
            result = []
        return {"status": "success", "data": result, "count": len(result)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/dashboard")
def get_market_analysis_dashboard(
    crop_type: str = Query("wheat", description="Crop/commodity keyword for focus"),
    state: Optional[str] = Query(None, description="Optional state filter"),
    market: Optional[str] = Query(None, description="Optional market filter"),
    language: str = Query("en", description="Language: en, hi"),
    limit: int = Query(180, description="Mandi records to fetch (max 500)"),
):
    """
    Live market analysis dashboard using real mandi feed + Sarvam/Gemini AI insights.
    """
    try:
        dashboard = get_market_dashboard_data(
            crop_type=crop_type,
            state=state,
            market=market,
            limit=limit,
        )
        google_updates = fetch_google_market_updates(
            crop_type=crop_type,
            language=language,
            max_items=6,
        )
        google_demand_signal = fetch_google_trends_demand_score(
            crop_type=crop_type,
            language=language,
            geo="IN",
        )
        google_demand_forecast_7d = build_google_demand_forecast_7d(google_demand_signal)
        ai_insights = _get_market_dashboard_ai_insights(crop_type, dashboard, language)
        market_opportunities = _build_market_opportunities(dashboard, language)
        trading_signals = _build_trading_signals(dashboard, language)

        live_snapshot_available = bool(dashboard.get("live_snapshot_available", False))
        preview_rows = dashboard.get("live_snapshot_rows", []) if live_snapshot_available else dashboard.get("rows", [])[:16]
        preview_source = "live_mandi_api" if live_snapshot_available else "historical_or_fallback"

        return {
            "status": "success",
            "source": dashboard.get("source", "unknown"),
            "using_real_mandi_api": dashboard.get("using_real_mandi_api", False),
            "using_historical_dataset": dashboard.get("using_historical_dataset", False),
            "filters": {
                "crop_type": crop_type,
                "state": state,
                "market": market,
                "language": language,
                "limit": limit,
            },
            "data_sources": {
                "live_record_count": dashboard.get("live_record_count", 0),
                "historical_record_count": dashboard.get("historical_record_count", 0),
                "google_updates_count": len(google_updates),
            },
            "summary": dashboard.get("summary", {}),
            "price_trend": dashboard.get("price_trend", []),
            "volume_trend": dashboard.get("volume_trend", []),
            "top_markets": dashboard.get("top_markets", []),
            "top_commodities": dashboard.get("top_commodities", []),
            "market_opportunities": market_opportunities,
            "trading_signals": trading_signals,
            "ai_insights": ai_insights,
            "google_demand_signal": google_demand_signal,
            "google_demand_forecast_7d": google_demand_forecast_7d,
            "google_market_updates": google_updates,
            "preview_source": preview_source,
            "preview_rows": preview_rows,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
        }
