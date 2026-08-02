import os
import httpx
from typing import Any, Dict, List, Optional
import json
from collections import defaultdict
from datetime import datetime
from urllib.parse import quote_plus
from xml.etree import ElementTree as ET
from dotenv import load_dotenv
import time
import pandas as pd

load_dotenv()

def _clean_env(value: Optional[str], default: str = "") -> str:
    if value is None:
        return default
    cleaned = value.strip().strip('"').strip("'")
    return cleaned or default


MANDI_API_KEY = _clean_env(
    os.getenv("MANDI_API_KEY") or os.getenv("DATA_GOV_API_KEY"),
    "",
)
MANDI_BASE_URL = _clean_env(
    os.getenv("MANDI_BASE_URL"),
    "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24",
)
MANDI_CACHE_TTL_SECONDS = 120
MANDI_CACHE_MAX_KEYS = 120

# data.gov.in uses non-intuitive commodity names (e.g. "Paddy(Common)" instead of "Rice").
# This map expands a user-friendly search term to the variants tried in sequence.
COMMODITY_ALIAS_MAP: Dict[str, List[str]] = {
    "rice":    ["Rice", "Paddy(Common)", "Paddy(Dhan)(Common)", "Paddy"],
    "paddy":   ["Paddy(Common)", "Paddy(Dhan)(Common)", "Paddy", "Rice"],
    "wheat":   ["Wheat", "Wheat(Dara)"],
    "maize":   ["Maize", "Maize(White)", "Maize(Yellow)"],
    "corn":    ["Maize", "Maize(White)", "Maize(Yellow)"],
    "soybean": ["Soyabean", "Soybean"],
    "soya":    ["Soyabean", "Soybean"],
    "mustard": ["Mustard", "Mustard Oil", "Rapeseed(Canola)"],
    "gram":    ["Gram", "Gram(Split)", "Bengal Gram(Whole)"],
    "chana":   ["Gram", "Gram(Split)", "Bengal Gram(Whole)"],
    "tur":     ["Tur", "Tur Dal", "Arhar(Tur)"],
    "arhar":   ["Arhar(Tur)", "Tur", "Tur Dal"],
    "cotton":  ["Cotton", "Cotton(Lint)", "Cotton Seed"],
    "sugarcane": ["Sugarcane"],
    "onion":   ["Onion", "Onion Green"],
    "potato":  ["Potato", "Potato (Red Nanital)"],
    "tomato":  ["Tomato"],
    "ginger":  ["Ginger(Dry)", "Ginger(Green)", "Ginger"],
    "garlic":  ["Garlic", "Garlic Green"],
    "turmeric": ["Turmeric", "Turmeric (Nizam)"],
    "banana":  ["Banana", "Banana - Green", "Banana (Ripe)"],
    "mango":   ["Mango", "Mango(Raw)(Green)"],
    "chilli":  ["Chilli", "Chili Red", "Dry Chillies"],
    "lentil":  ["Lentil", "Masur Dal", "Masur(Whole)"],
    "masoor":  ["Masur Dal", "Masur(Whole)", "Lentil"],
    "bajra":   ["Bajra(Pearl Millet/Cumbu)", "Bajra"],
    "millet":  ["Bajra(Pearl Millet/Cumbu)", "Jowar(Sorghum)", "Ragi(Finger Millet)"],
    "jowar":   ["Jowar(Sorghum)", "Jowar"],
    "ragi":    ["Ragi(Finger Millet)", "Ragi"],
    "groundnut": ["Groundnut", "Groundnut (Split)", "Groundnut Pods(Peanuts)"],
    "peanut":  ["Groundnut Pods(Peanuts)", "Groundnut", "Groundnut (Split)"],
    "sunflower": ["Sunflower", "Sunflower Seed"],
    "sesame":  ["Sesamum(Sesame, Gingelly, Til)", "Sesame"],
    "til":     ["Sesamum(Sesame, Gingelly, Til)", "Sesame"],
    "moong":   ["Moong(Green Gram)", "Green Gram(Whole)", "Moong Dal"],
    "urad":    ["Black Gram (Urd Beans)(Whole)", "Urad Dal", "Black Gram"],
    "peas":    ["Peas Wet", "Peas Dry", "Field Pea"],
    "cauliflower": ["Cauliflower"],
    "cabbage": ["Cabbage"],
    "ladyfinger": ["Bhindi(Ladies Finger)", "Okra(Ladies Finger)"],
    "bhindi":  ["Bhindi(Ladies Finger)", "Okra(Ladies Finger)"],
    "okra":    ["Bhindi(Ladies Finger)", "Okra(Ladies Finger)"],
    "brinjal": ["Brinjal", "Bringal"],
    "bitter gourd": ["Bitter gourd", "Bitter Gourd"],
    "karela":  ["Bitter gourd", "Bitter Gourd"],
    "cucumber": ["Cucumber(Kheera)", "Cucumber"],
    "watermelon": ["Water Melon"],
    "grapes":  ["Grapes"],
    "apple":   ["Apple"],
    "guava":   ["Guava"],
    "papaya":  ["Papaya(Raw)", "Papaya"],
    "pineapple": ["Pineapple"],
}


def _resolve_commodity_aliases(commodity: str) -> List[str]:
    """Return ordered list of API commodity names to try for the given user input."""
    key = (commodity or "").strip().lower()
    if key in COMMODITY_ALIAS_MAP:
        return COMMODITY_ALIAS_MAP[key]
    # Fall back to title-cased input only
    return [str(commodity).strip().title()]


HISTORICAL_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/indian_crop_prices.csv")
)

_MANDI_CACHE: Dict[str, Dict[str, Any]] = {}

_MANDI_HTTP_CLIENT = httpx.Client(
    timeout=httpx.Timeout(45.0, connect=10.0),
    follow_redirects=True,
    limits=httpx.Limits(max_connections=60, max_keepalive_connections=20),
)

_HISTORICAL_DATAFRAME_CACHE: Dict[str, Any] = {
    "mtime": None,
    "df": None,
}


def _trim_mandi_cache() -> None:
    if len(_MANDI_CACHE) <= MANDI_CACHE_MAX_KEYS:
        return

    sortable_items = sorted(
        _MANDI_CACHE.items(),
        key=lambda item: float(item[1].get("timestamp", 0.0) or 0.0),
    )
    overflow = len(sortable_items) - MANDI_CACHE_MAX_KEYS
    for key, _value in sortable_items[:overflow]:
        _MANDI_CACHE.pop(key, None)


def get_historical_dataset_df() -> pd.DataFrame:
    """Load and cache historical dataset frame using file mtime invalidation."""
    if not os.path.exists(HISTORICAL_DATA_PATH):
        return pd.DataFrame()

    try:
        mtime = os.path.getmtime(HISTORICAL_DATA_PATH)
    except Exception:
        return pd.DataFrame()

    cached_mtime = _HISTORICAL_DATAFRAME_CACHE.get("mtime")
    cached_df = _HISTORICAL_DATAFRAME_CACHE.get("df")
    if cached_df is not None and cached_mtime == mtime:
        return cached_df

    try:
        df = pd.read_csv(HISTORICAL_DATA_PATH, low_memory=False)
        if df.empty:
            _HISTORICAL_DATAFRAME_CACHE["mtime"] = mtime
            _HISTORICAL_DATAFRAME_CACHE["df"] = df
            return df

        text_cols = ["Crop", "State", "Market", "Date"]
        for col in text_cols:
            if col not in df.columns:
                df[col] = ""
            df[col] = df[col].fillna("").astype(str)

        for col in ["Month", "Year"]:
            if col not in df.columns:
                df[col] = None

        # Precompute normalized columns once to avoid repeated per-request transforms.
        df["__crop_lc"] = df["Crop"].str.lower()
        df["__state_lc"] = df["State"].str.lower()
        df["__market_lc"] = df["Market"].str.lower()
        df["__month_int"] = pd.to_numeric(df["Month"], errors="coerce")
        df["__year_int"] = pd.to_numeric(df["Year"], errors="coerce")
        df["__date_sort"] = pd.to_datetime(df["Date"], errors="coerce", dayfirst=True)

        _HISTORICAL_DATAFRAME_CACHE["mtime"] = mtime
        _HISTORICAL_DATAFRAME_CACHE["df"] = df
        return df
    except Exception:
        return pd.DataFrame()


def _record_sort_key(record: Dict) -> tuple:
    parsed_date = _parse_arrival_date(str(record.get("Arrival_Date", "") or ""))
    timestamp = parsed_date.timestamp() if parsed_date else 0.0
    return (timestamp, _safe_int(record.get("Modal_Price", 0)))


def _safe_int(value: object) -> int:
    try:
        return int(float(str(value).replace(",", "").strip()))
    except Exception:
        return 0


def _safe_float(value: object) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except Exception:
        return 0.0


def _strip_xssi_prefix(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if text.startswith(")]}'"):
        parts = text.split("\n", 1)
        return parts[1] if len(parts) > 1 else "{}"
    return text


def _normalize_mandi_record(record: Dict) -> Optional[Dict]:
    commodity = str(record.get("Commodity", "") or "").strip()
    market = str(record.get("Market", "") or "").strip()
    state = str(record.get("State", "") or "").strip()
    arrival_date = str(record.get("Arrival_Date", "") or "").strip()

    if not commodity or not market:
        return None

    modal_price = _safe_int(record.get("Modal_Price", 0))
    min_price = _safe_int(record.get("Min_Price", 0))
    max_price = _safe_int(record.get("Max_Price", 0))

    trend = "→"
    if modal_price > 0 and max_price > 0:
        if modal_price >= max_price:
            trend = "↑"
        elif modal_price <= min_price:
            trend = "↓"

    return {
        "commodity": commodity,
        "market": market,
        "state": state,
        "price": modal_price,
        "min_price": min_price,
        "max_price": max_price,
        "change": f"₹{min_price}-{max_price}",
        "trend": trend,
        "date": arrival_date or "N/A",
        "icon": get_commodity_icon(commodity),
    }


def _parse_arrival_date(date_str: str) -> Optional[datetime]:
    value = (date_str or "").strip()
    if not value:
        return None

    fmts = ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d %b %Y", "%d %B %Y"]
    for fmt in fmts:
        try:
            return datetime.strptime(value, fmt)
        except Exception:
            continue
    return None


def _normalize_dataset_record(record: Dict) -> Optional[Dict]:
    commodity = str(record.get("Crop", "") or "").strip()
    market = str(record.get("Market", "") or "").strip()
    state = str(record.get("State", "") or "").strip()
    date = str(record.get("Date", "") or "").strip()

    if not commodity or not market:
        return None

    price = _safe_int(record.get("Price", 0))
    min_price = _safe_int(record.get("MinPrice", 0))
    max_price = _safe_int(record.get("MaxPrice", 0))

    trend = "→"
    if price >= max_price and price > 0:
        trend = "↑"
    elif price <= min_price and price > 0:
        trend = "↓"

    return {
        "commodity": commodity,
        "market": market,
        "state": state,
        "price": price,
        "min_price": min_price,
        "max_price": max_price,
        "change": f"₹{min_price}-{max_price}",
        "trend": trend,
        "date": date or "N/A",
        "icon": get_commodity_icon(commodity),
        "source": "historical_dataset",
    }


def _load_historical_dataset_rows(
    crop_type: Optional[str] = None,
    state: Optional[str] = None,
    market: Optional[str] = None,
    limit: int = 180,
) -> List[Dict]:
    try:
        df = get_historical_dataset_df()
        if df.empty:
            return []

        if crop_type:
            crop_q = crop_type.lower().strip()
            if crop_q:
                df = df[df["__crop_lc"].str.contains(crop_q, na=False)]

        if state:
            state_q = state.lower().strip()
            if state_q:
                df = df[df["__state_lc"].str.contains(state_q, na=False)]

        if market:
            market_q = market.lower().strip()
            if market_q:
                df = df[df["__market_lc"].str.contains(market_q, na=False)]

        if df.empty:
            return []

        # Prefer latest rows from dataset for closer-to-live context.
        df = df.sort_values(by=["__date_sort", "Date"], ascending=False).head(max(20, min(limit, 400)))

        rows: List[Dict] = []
        for rec in df.to_dict(orient="records"):
            parsed = _normalize_dataset_record(rec)
            if parsed:
                rows.append(parsed)
        return rows
    except Exception:
        return []


def _fetch_raw_mandi_records(
    limit: int = 150,
    force_refresh: bool = False,
    offset: int = 0,
    commodity: Optional[str] = None,
    state: Optional[str] = None,
    market: Optional[str] = None,
) -> Dict:
    normalized_limit = max(10, min(limit, 500))
    normalized_offset = max(0, offset)
    cache_key = f"{normalized_offset}:{normalized_limit}:{commodity or ''}:{state or ''}:{market or ''}"

    if not force_refresh:
        cache_entry = _MANDI_CACHE.get(cache_key, {})
        cached_records = cache_entry.get("records", [])
        if not isinstance(cached_records, list):
            cached_records = []

        try:
            cached_timestamp = float(cache_entry.get("timestamp", 0.0) or 0.0)
        except Exception:
            cached_timestamp = 0.0

        age_seconds = time.time() - cached_timestamp

        if cached_records and age_seconds < MANDI_CACHE_TTL_SECONDS:
            return {
                "records": cached_records,
                "source": "india_mandi_api_cache",
                "success": True,
                "offset": normalized_offset,
                "limit": normalized_limit,
            }

    if not MANDI_API_KEY:
        return {
            "records": [],
            "source": "missing_mandi_api_key",
            "success": False,
        }

    # data.gov.in is unreliable with combined commodity+state filters.
    # Strategy:
    # 1. Resolve user-friendly commodity aliases such as rice -> Paddy(Common).
    # 2. Send only one upstream filter when commodity is present.
    # 3. Apply state/market filtering locally on the returned batch.
    def _build_raw_url(
        commodity_name: Optional[str],
        state_filter: Optional[str],
        market_filter: Optional[str],
        lim: int,
    ) -> str:
        from urllib.parse import quote as _quote

        parts = [
            f"{MANDI_BASE_URL}?api-key={MANDI_API_KEY}",
            "format=json",
            f"limit={lim}",
            f"offset={normalized_offset}",
            "sort[Arrival_Date]=desc",
        ]

        if commodity_name:
            parts.append(
                f"filters[Commodity]={_quote(str(commodity_name).strip(), safe='()')}"
            )
        elif state_filter:
            parts.append(f"filters[State]={_quote(str(state_filter).strip(), safe='')}" )
        elif market_filter:
            parts.append(f"filters[Market]={_quote(str(market_filter).strip(), safe='')}" )

        return "&".join(parts)

    commodity_names_to_try: List[Optional[str]] = (
        _resolve_commodity_aliases(commodity) if commodity else [None]
    )
    use_local_state = bool(commodity and state)
    use_local_market = bool(commodity and market)
    api_limit = 500 if (use_local_state or use_local_market) else normalized_limit

    all_records: List[Dict] = []

    for commodity_name in commodity_names_to_try:
        raw_url = _build_raw_url(
            commodity_name,
            state if not commodity_name else None,
            market if not commodity_name else None,
            api_limit,
        )

        try:
            response = _MANDI_HTTP_CLIENT.get(raw_url)
            response.raise_for_status()
            data = response.json()
            batch = data.get("records", []) if isinstance(data, dict) else []
            if not isinstance(batch, list):
                batch = []

            if use_local_state and batch:
                state_q = state.lower().strip()
                batch = [
                    record for record in batch
                    if state_q in str(record.get("State", "")).lower()
                ]

            if use_local_market and batch:
                market_q = market.lower().strip()
                batch = [
                    record for record in batch
                    if market_q in str(record.get("Market", "")).lower()
                ]

            if batch:
                all_records.extend(batch)
                if len(commodity_names_to_try) > 1:
                    latest = _parse_arrival_date(str(batch[0].get("Arrival_Date", "") or ""))
                    if latest and (datetime.now() - latest).days <= 30:
                        break
        except Exception:
            continue

    records = sorted(all_records, key=_record_sort_key, reverse=True)

    if records:
        _MANDI_CACHE[cache_key] = {
            "timestamp": time.time(),
            "records": records,
            "source": "india_mandi_api",
        }
        _trim_mandi_cache()
        return {
            "records": records,
            "source": "india_mandi_api",
            "success": True,
            "offset": normalized_offset,
            "limit": normalized_limit,
        }

    stale_records = _MANDI_CACHE.get(cache_key, {}).get("records", [])
    if isinstance(stale_records, list) and stale_records:
        return {
            "records": stale_records,
            "source": "india_mandi_api_stale_cache",
            "success": True,
            "offset": normalized_offset,
            "limit": normalized_limit,
        }

    return {
        "records": [],
        "source": "india_mandi_api_error",
        "success": False,
        "offset": normalized_offset,
        "limit": normalized_limit,
    }


def _prepare_live_price_rows(records: List[Dict], limit: Optional[int] = None) -> List[Dict]:
    normalized_rows: List[Dict] = []
    seen_pairs = set()

    sorted_records = sorted(records, key=_record_sort_key, reverse=True)
    for record in sorted_records:
        normalized = _normalize_mandi_record(record)
        if not normalized:
            continue

        dedupe_key = (
            normalized.get("commodity", "").lower(),
            normalized.get("market", "").lower(),
            normalized.get("state", "").lower(),
        )
        if dedupe_key in seen_pairs:
            continue

        seen_pairs.add(dedupe_key)
        normalized_rows.append(normalized)

        if limit and len(normalized_rows) >= limit:
            break

    return normalized_rows


def fetch_live_mandi_prices(
    limit: int = 80,
    force_refresh: bool = False,
    offset: int = 0,
    commodity: Optional[str] = None,
    state: Optional[str] = None,
) -> List[Dict]:
    """
    Fetch live commodity prices from India's Mandi API.
    Optional commodity and state params push filters to the upstream API for accurate results.
    """
    try:
        expanded_limit = max(limit * 4, 160) if not (commodity or state) else min(limit * 2, 500)
        raw = _fetch_raw_mandi_records(
            limit=min(expanded_limit, 500),
            force_refresh=force_refresh,
            offset=offset,
            commodity=commodity or None,
            state=state or None,
        )
        records = raw.get("records", [])

        prices = _prepare_live_price_rows(records, limit=limit)

        if len(prices) == 0:
            return get_fallback_prices(limit=limit, commodity=commodity, state=state)

        return prices
    except Exception:
        return get_fallback_prices(limit=limit, commodity=commodity, state=state)


def get_market_dashboard_data(
    crop_type: Optional[str] = None,
    state: Optional[str] = None,
    market: Optional[str] = None,
    limit: int = 180,
) -> Dict:
    """
    Build market-analysis ready payload from live mandi API.
    """
    raw = _fetch_raw_mandi_records(
        limit=min(max(limit * 3, 180), 500),
        commodity=crop_type,
        state=state,
        market=market,
    )
    records = raw.get("records", [])

    live_rows: List[Dict] = []
    for parsed in _prepare_live_price_rows(records):
        if not parsed:
            continue
        if crop_type and crop_type.lower() not in parsed["commodity"].lower():
            continue
        if state and state.lower() not in parsed["state"].lower():
            continue
        if market and market.lower() not in parsed["market"].lower():
            continue
        parsed["source"] = "live_mandi_api"
        live_rows.append(parsed)

    # Build a live-first snapshot list; if crop filter is too strict, fall back to broader live rows.
    live_snapshot_rows = list(live_rows)
    if not live_snapshot_rows:
        broad_live = fetch_live_mandi_prices(limit=max(40, min(limit, 140)), force_refresh=False, offset=0)
        for row in broad_live:
            if state and state.lower() not in str(row.get("state", "")).lower():
                continue
            if market and market.lower() not in str(row.get("market", "")).lower():
                continue
            normalized = {
                "commodity": row.get("commodity", ""),
                "market": row.get("market", ""),
                "state": row.get("state", ""),
                "price": _safe_int(row.get("price", 0)),
                "min_price": _safe_int(row.get("min_price", 0)),
                "max_price": _safe_int(row.get("max_price", 0)),
                "change": row.get("change", ""),
                "trend": row.get("trend", "→"),
                "date": row.get("date", "N/A"),
                "icon": row.get("icon", "📦"),
                "source": "live_mandi_api",
            }
            live_snapshot_rows.append(normalized)

    historical_rows: List[Dict] = []
    if not live_rows:
        historical_rows = _load_historical_dataset_rows(
            crop_type=crop_type,
            state=state,
            market=market,
            limit=max(80, min(limit, 260)),
        )

    normalized_rows = list(live_rows) if live_rows else list(historical_rows)

    using_live_api = bool(live_rows)
    using_historical_dataset = bool(historical_rows)
    if using_live_api and using_historical_dataset:
        source = "live_mandi_api_plus_historical_dataset"
    elif using_live_api:
        source = "live_mandi_api"
    elif using_historical_dataset:
        source = "historical_dataset"
    else:
        source = "no_data_available"

    if not normalized_rows:
        normalized_rows = get_fallback_prices(limit=max(20, min(limit, 120)))
        if normalized_rows:
            using_historical_dataset = True
            source = "historical_dataset"

    price_trend_map: Dict[str, List[int]] = defaultdict(list)
    volume_trend_map: Dict[str, int] = defaultdict(int)
    market_map: Dict[str, Dict] = defaultdict(lambda: {
        "market": "",
        "state": "",
        "avg_price_sum": 0,
        "count": 0,
        "up": 0,
        "down": 0,
        "stable": 0,
    })
    commodity_map: Dict[str, Dict] = defaultdict(lambda: {
        "commodity": "",
        "avg_price_sum": 0,
        "count": 0,
        "up": 0,
        "down": 0,
        "stable": 0,
    })

    up_count = 0
    down_count = 0
    stable_count = 0

    for row in normalized_rows:
        price = _safe_int(row.get("price", 0))
        trend = row.get("trend", "→")

        parsed_date = _parse_arrival_date(str(row.get("date", "")))
        bucket = parsed_date.strftime("%d %b") if parsed_date else "Latest"

        price_trend_map[bucket].append(price)
        volume_trend_map[bucket] += 1

        market_key = f"{row.get('market', '')}|{row.get('state', '')}"
        market_item = market_map[market_key]
        market_item["market"] = row.get("market", "")
        market_item["state"] = row.get("state", "")
        market_item["avg_price_sum"] += price
        market_item["count"] += 1
        if trend == "↑":
            market_item["up"] += 1
            up_count += 1
        elif trend == "↓":
            market_item["down"] += 1
            down_count += 1
        else:
            market_item["stable"] += 1
            stable_count += 1

        commodity_key = row.get("commodity", "")
        commodity_item = commodity_map[commodity_key]
        commodity_item["commodity"] = commodity_key
        commodity_item["avg_price_sum"] += price
        commodity_item["count"] += 1
        if trend == "↑":
            commodity_item["up"] += 1
        elif trend == "↓":
            commodity_item["down"] += 1
        else:
            commodity_item["stable"] += 1

    price_trend = []
    for label, values in list(price_trend_map.items())[-14:]:
        avg_price = round(sum(values) / max(1, len(values)), 2)
        price_trend.append({"label": label, "avg_price": avg_price, "sample_size": len(values)})

    volume_trend = []
    for label, total in list(volume_trend_map.items())[-14:]:
        volume_trend.append({"label": label, "volume_index": total})

    top_markets = sorted(
        [
            {
                "market": v["market"],
                "state": v["state"],
                "avg_price": round(v["avg_price_sum"] / max(1, v["count"]), 2),
                "samples": v["count"],
                "trend": "up" if v["up"] >= max(v["down"], v["stable"]) else "down" if v["down"] > max(v["up"], v["stable"]) else "stable",
            }
            for v in market_map.values()
        ],
        key=lambda x: x["avg_price"],
        reverse=True,
    )[:6]

    top_commodities = sorted(
        [
            {
                "commodity": v["commodity"],
                "avg_price": round(v["avg_price_sum"] / max(1, v["count"]), 2),
                "samples": v["count"],
                "trend": "up" if v["up"] >= max(v["down"], v["stable"]) else "down" if v["down"] > max(v["up"], v["stable"]) else "stable",
            }
            for v in commodity_map.values()
        ],
        key=lambda x: x["avg_price"],
        reverse=True,
    )[:8]

    avg_modal = round(
        sum(_safe_int(item.get("price", 0)) for item in normalized_rows) / max(1, len(normalized_rows)),
        2,
    )

    return {
        "source": source,
        "using_real_mandi_api": using_live_api,
        "using_historical_dataset": using_historical_dataset,
        "live_record_count": len(live_rows),
        "historical_record_count": len(historical_rows),
        "live_snapshot_available": bool(live_snapshot_rows),
        "live_snapshot_rows": live_snapshot_rows[:16],
        "rows": normalized_rows,
        "summary": {
            "records": len(normalized_rows),
            "total_markets": len(set(f"{r.get('market', '')}|{r.get('state', '')}" for r in normalized_rows)),
            "total_commodities": len(set(r.get("commodity", "") for r in normalized_rows if r.get("commodity"))),
            "avg_modal_price": avg_modal,
            "movement_up": up_count,
            "movement_down": down_count,
            "movement_stable": stable_count,
        },
        "price_trend": price_trend,
        "volume_trend": volume_trend,
        "top_markets": top_markets,
        "top_commodities": top_commodities,
    }


def fetch_google_market_updates(
    crop_type: str = "wheat",
    language: str = "en",
    max_items: int = 6,
) -> List[Dict[str, str]]:
    query = f"{crop_type} mandi price India"
    lang_code = "hi" if language == "hi" else "en"
    region = "IN"
    rss_url = (
        "https://news.google.com/rss/search"
        f"?q={quote_plus(query)}&hl={lang_code}-{region}&gl={region}&ceid={region}:{lang_code}"
    )

    try:
        response = requests.get(rss_url, timeout=12)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        items = root.findall("./channel/item")

        updates: List[Dict[str, str]] = []
        for item in items[: max(1, min(max_items, 12))]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            source_node = item.find("source")
            source_name = (source_node.text or "Google News") if source_node is not None else "Google News"

            if not title or not link:
                continue

            updates.append(
                {
                    "title": title,
                    "link": link,
                    "published_at": pub_date,
                    "source": source_name,
                }
            )

        return updates
    except Exception:
        return []


def fetch_google_trends_demand_score(
    crop_type: str = "wheat",
    language: str = "en",
    geo: str = "IN",
) -> Dict[str, Any]:
    keyword = (crop_type or "wheat").strip() or "wheat"
    hl = "hi-IN" if language == "hi" else "en-US"
    tz = "-330"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        )
    }

    try:
        explore_req = {
            "comparisonItem": [{"keyword": keyword, "geo": geo, "time": "today 3-m"}],
            "category": 0,
            "property": "",
        }

        explore_resp = requests.get(
            "https://trends.google.com/trends/api/explore",
            params={"hl": hl, "tz": tz, "req": json.dumps(explore_req)},
            headers=headers,
            timeout=12,
        )
        explore_resp.raise_for_status()
        explore_data = json.loads(_strip_xssi_prefix(explore_resp.text))

        widgets = explore_data.get("widgets", []) if isinstance(explore_data, dict) else []
        timeseries_widget = None
        for widget in widgets:
            if str(widget.get("id", "")).upper() == "TIMESERIES":
                timeseries_widget = widget
                break

        if not timeseries_widget:
            raise ValueError("Timeseries widget not found")

        token = timeseries_widget.get("token")
        request_obj = timeseries_widget.get("request")
        if not token or not request_obj:
            raise ValueError("Timeseries token/request missing")

        trends_resp = requests.get(
            "https://trends.google.com/trends/api/widgetdata/multiline",
            params={
                "hl": hl,
                "tz": tz,
                "req": json.dumps(request_obj, separators=(",", ":")),
                "token": token,
            },
            headers=headers,
            timeout=12,
        )
        trends_resp.raise_for_status()
        trends_data = json.loads(_strip_xssi_prefix(trends_resp.text))

        timeline = trends_data.get("default", {}).get("timelineData", [])
        values: List[float] = []
        for point in timeline:
            value_arr = point.get("value") if isinstance(point, dict) else None
            if isinstance(value_arr, list) and value_arr:
                values.append(_safe_float(value_arr[0]))

        if not values:
            raise ValueError("No trends data values")

        latest = values[-1]
        avg = sum(values) / max(1, len(values))
        momentum = latest - avg
        if momentum > 6:
            trend = "up"
        elif momentum < -6:
            trend = "down"
        else:
            trend = "stable"

        return {
            "keyword": keyword,
            "score": round(max(0.0, min(100.0, latest)), 1),
            "average_score": round(avg, 1),
            "momentum": round(momentum, 1),
            "trend": trend,
            "timeframe": "today 3-m",
            "source": "google_trends",
        }
    except Exception:
        updates = fetch_google_market_updates(crop_type=keyword, language=language, max_items=6)
        fallback_score = min(100, 35 + (len(updates) * 8))
        return {
            "keyword": keyword,
            "score": float(fallback_score),
            "average_score": float(fallback_score),
            "momentum": 0.0,
            "trend": "stable",
            "timeframe": "latest news activity",
            "source": "google_news_fallback",
        }


def build_google_demand_forecast_7d(signal: Dict[str, Any]) -> List[Dict[str, Any]]:
    base_score = _safe_float(signal.get("score", 0))
    momentum = _safe_float(signal.get("momentum", 0))
    trend = str(signal.get("trend", "stable"))

    if trend == "up":
        drift = max(0.6, min(4.0, abs(momentum) / 6.0 if momentum else 1.4))
    elif trend == "down":
        drift = -max(0.6, min(4.0, abs(momentum) / 6.0 if momentum else 1.4))
    else:
        drift = 0.0

    # Small deterministic wave for visual realism while keeping deterministic output.
    wave = [0.0, 0.8, -0.5, 1.1, -1.0, 0.6, 0.0]

    forecast: List[Dict[str, Any]] = []
    for idx in range(7):
        raw = base_score + ((idx + 1) * drift) + wave[idx]
        bounded = max(0.0, min(100.0, raw))
        forecast.append(
            {
                "day": f"D+{idx + 1}",
                "score": round(bounded, 1),
            }
        )

    return forecast


def get_commodity_icon(commodity: str) -> str:
    """Map commodity to emoji icon"""
    icons = {
        "tomato": "🍅",
        "potato": "🥔",
        "onion": "🧅",
        "carrot": "🥕",
        "wheat": "🌾",
        "rice": "🍚",
        "paddy": "🌾",
        "maize": "🌽",
        "sugarcane": "🎋",
        "cotton": "🏵️",
        "chilli": "🌶️",
        "garlic": "🧄",
        "cabbage": "🥬",
    }
    
    commodity_lower = commodity.lower()
    for key, icon in icons.items():
        if key in commodity_lower:
            return icon
    
    return "📦"


def get_fallback_prices(
    limit: int = 20,
    commodity: Optional[str] = None,
    state: Optional[str] = None,
) -> List[Dict]:
    """Return recent historical rows when live API data is unavailable.
    Filters by commodity/state when provided so fallback data is relevant.
    When a specific state is requested and no match found, returns [] so the
    frontend can show 'No results' instead of misleading wrong-state data."""
    rows = _load_historical_dataset_rows(
        crop_type=commodity or None,
        state=state or None,
        limit=max(10, min(limit, 200)),
    )
    # Only fall back to unfiltered generic rows when no state was specified.
    # If state was given but nothing matched, return [] (honest "no data").
    if not rows and not state:
        rows = _load_historical_dataset_rows(limit=max(10, min(limit, 200)))
    return rows


def predict_price(crop_name: str, quantity: float, season: str = "current", language: str = "en") -> Dict:
    """
    Predict crop prices based on historical data
    """
    # Mock prediction - in production, use ML model
    base_prices = {
        "tomato": 2200,
        "potato": 1900,
        "onion": 2050,
        "wheat": 2500,
        "rice": 3100,
        "carrot": 1800,
    }
    
    crop_lower = crop_name.lower()
    base_price = base_prices.get(crop_lower, 2000)
    
    # Simple prediction: add random percentage variation
    variation = 1.05  # 5% increase as sample
    predicted_price = base_price * variation
    
    prediction = {
        "crop_name": crop_name,
        "quantity": quantity,
        "season": season,
        "current_price": base_price,
        "predicted_price": round(predicted_price, 2),
        "change_percentage": round((variation - 1) * 100, 2),
        "recommendation": "Good time to sell" if variation > 1 else "Hold for better prices",
        "predicted_date": "2024-02-15",
        "language": language
    }
    
    return prediction
