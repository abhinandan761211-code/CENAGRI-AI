import os
from typing import Optional

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import math
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

import requests
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.weather_service import (
    add_weather_subscriber,
    get_weather_service,
    list_weather_subscribers,
    run_daily_weather_alert_job,
    weather_scheduler_status,
)
from app.services.sarvam_service import get_sarvam_service
from app.utils.auth import decode_access_token


router = APIRouter()


ROLE_INTEREST_HINTS = {
    "farmer": ["crop", "farming", "irrigation", "pest", "yield", "mandi", "subsidy"],
    "buyer": ["mandi", "price", "procurement", "quality", "supply"],
    "local_buyer": ["local market", "mandi", "fresh produce", "district prices"],
    "worker": ["farm labour", "agri jobs", "harvest", "mechanization"],
    "equipment_owner": ["tractor", "implements", "machinery", "rentals"],
    "transporter": ["logistics", "cold chain", "transport", "supply chain"],
    "store": ["warehouse", "storage", "post-harvest", "inventory"],
    "admin": ["policy", "agriculture scheme", "food security", "rural economy"],
}

AGRI_RSS_FEEDS = [
    ("The Hindu Agriculture", "https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss"),
    ("Indian Express Farming", "https://indianexpress.com/section/india/farming/feed/"),
    ("Krishi Jagran", "https://krishijagran.com/feed/"),
]

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")
NEWSDATA_API_KEY = os.getenv("NEWSDATA_API_KEY", "")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "")
SERPAPI_BASE_URL = "https://serpapi.com/search"
CURATED_YOUTUBE_CHANNEL_IDS = [
    "UC5r7I7VIQSy6I3BNwQ6wx9g",  # Agro Tutor
    "UCP9kZ5yU7WbeT_lzxuxLSHQ",  # Agri Gyan
]

AGRI_CORE_TERMS = {
    "agri",
    "agriculture",
    "farm",
    "farming",
    "farmer",
    "farmers",
    "kisan",
    "krishi",
    "mandi",
    "crop",
    "crops",
    "harvest",
    "sowing",
    "seed",
    "seeds",
    "paddy",
    "wheat",
    "rice",
    "maize",
    "cotton",
    "soybean",
    "mustard",
    "millet",
    "fertilizer",
    "irrigation",
    "pest",
    "weather",
    "monsoon",
    "subsidy",
    "msp",
    "pmkisan",
}

LIVESTOCK_TERMS = {
    "livestock",
    "dairy",
    "goat",
    "goats",
    "animal",
    "animals",
    "poultry",
    "cattle",
    "sheep",
    "buffalo",
}

SEARCH_STOP_WORDS = {
    "a",
    "an",
    "and",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "by",
    "near",
    "latest",
    "news",
    "update",
    "updates",
    "schedule",
}

SEARCH_GENERIC_TERMS = {
    "agri",
    "agriculture",
    "farm",
    "farming",
    "farmer",
    "farmers",
    "kisan",
    "krishi",
    "crop",
    "crops",
    "india",
}

SEARCH_TERM_EQUIVALENTS = {
    "mandi": {"msp"},
    "price": {"prices", "mandi", "msp"},
    "prices": {"price", "mandi", "msp"},
    "subsidy": {"scheme", "schemes", "pmkisan"},
    "paddy": {"rice"},
    "rice": {"paddy"},
    "maize": {"corn"},
    "corn": {"maize"},
    "irrigation": {"water"},
    "goat": {"goats", "livestock", "dairy"},
    "goats": {"goat", "livestock", "dairy"},
}

LOW_SIGNAL_VIDEO_PATTERNS = [
    "presenting this wonderful application",
    "my agriculture family",
    "welcome to my channel",
    "introduction video",
]

EXTERNAL_NEWS_NOISE_TERMS = {
    "billion",
    "million",
    "cagr",
    "forecast",
    "report",
    "industry",
    "research",
    "analysis",
    "outlook",
    "market",
    "global",
    "press",
    "release",
    "size",
    "university",
    "admission",
    "counselling",
    "exam",
    "syllabus",
    "phd",
}

EXTERNAL_NEWS_AGRI_STRONG_TERMS = {
    "agriculture",
    "agri",
    "farmer",
    "farmers",
    "farming",
    "kisan",
    "krishi",
    "mandi",
    "crop",
    "crops",
    "wheat",
    "paddy",
    "rice",
    "maize",
    "irrigation",
    "fertilizer",
    "subsidy",
    "msp",
    "monsoon",
    "weather",
    "pest",
}


def _fetch_youtube_rss_items(queries: list[str], max_items: int = 12) -> list[dict]:
    try:
        matched_updates: list[dict] = []
        fallback_updates: list[dict] = []
        seen_video_ids: set[str] = set()
        seen_links: set[str] = set()
        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "media": "http://search.yahoo.com/mrss/",
            "yt": "http://www.youtube.com/xml/schemas/2015",
        }

        query_tokens = set()
        for query in queries[:6]:
            query_tokens.update(_tokenize_text(str(query or "")))

        for channel_id in CURATED_YOUTUBE_CHANNEL_IDS:
            feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
            response = requests.get(feed_url, timeout=10)
            response.raise_for_status()

            root = ET.fromstring(response.content)
            entries = root.findall("atom:entry", ns)

            for entry in entries:
                video_id = str(entry.findtext("yt:videoId", default="", namespaces=ns) or "").strip()
                title = str(entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
                published_at = str(entry.findtext("atom:published", default="", namespaces=ns) or "").strip()
                updated_at = str(entry.findtext("atom:updated", default="", namespaces=ns) or "").strip()

                link_node = entry.find("atom:link", ns)
                link = str((link_node.get("href") if link_node is not None else "") or "").strip()

                author_node = entry.find("atom:author", ns)
                channel = "YouTube"
                if author_node is not None:
                    author_name = str(author_node.findtext("atom:name", default="", namespaces=ns) or "").strip()
                    if author_name:
                        channel = author_name

                thumb_node = entry.find("media:group/media:thumbnail", ns)
                image_url = ""
                if thumb_node is not None:
                    image_url = str(thumb_node.get("url") or "").strip()

                if not video_id and link:
                    match = re.search(r"[?&]v=([a-zA-Z0-9_-]{6,})", link)
                    if match:
                        video_id = str(match.group(1))

                if not video_id or not title:
                    continue
                if video_id in seen_video_ids or link in seen_links:
                    continue
                if _is_low_signal_video_title(title):
                    continue

                record = {
                    "title": title,
                    "link": link or f"https://www.youtube.com/watch?v={video_id}",
                    "video_id": video_id,
                    "video_embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0&modestbranding=1&playsinline=1",
                    # Prefer feed update timestamp when present so actively maintained channels
                    # are not treated as stale purely because the original upload date is old.
                    "published_at": updated_at or published_at,
                    "source": channel,
                    "source_provider": "youtube",
                    "image_url": image_url,
                }

                title_tokens = set(_tokenize_text(title))
                has_query_match = bool(query_tokens and title_tokens.intersection(query_tokens))
                is_agri_match = _is_agri_relevant(
                    title=title,
                    source=channel,
                    profile_terms=[],
                    search_terms=list(query_tokens),
                )

                # Drop generic/non-agri videos from RSS fallback channels.
                if not (has_query_match or is_agri_match):
                    continue

                if has_query_match:
                    matched_updates.append(record)
                else:
                    fallback_updates.append(record)

                seen_video_ids.add(video_id)
                if link:
                    seen_links.add(link)

                if len(matched_updates) >= max(1, min(max_items, 120)):
                    return matched_updates

        combined = [*matched_updates, *fallback_updates]
        if combined:
            return combined[: max(1, min(max_items, 120))]

        # Last fallback: try YouTube legacy search RSS query endpoint for compatibility.
        for query in queries[:4]:
            cleaned = str(query or "").strip()
            if not cleaned:
                continue

            search_feed = f"https://www.youtube.com/feeds/videos.xml?search_query={quote_plus(cleaned)}"
            response = requests.get(search_feed, timeout=10)
            if response.status_code >= 400:
                continue

            root = ET.fromstring(response.content)
            entries = root.findall("atom:entry", ns)
            for entry in entries:
                video_id = str(entry.findtext("yt:videoId", default="", namespaces=ns) or "").strip()
                title = str(entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
                if not video_id or not title or video_id in seen_video_ids:
                    continue
                if _is_low_signal_video_title(title):
                    continue

                link_node = entry.find("atom:link", ns)
                link = str((link_node.get("href") if link_node is not None else "") or "").strip()
                published_at = str(entry.findtext("atom:published", default="", namespaces=ns) or "").strip()
                author_node = entry.find("atom:author", ns)
                channel = "YouTube"
                if author_node is not None:
                    author_name = str(author_node.findtext("atom:name", default="", namespaces=ns) or "").strip()
                    if author_name:
                        channel = author_name

                thumb_node = entry.find("media:group/media:thumbnail", ns)
                image_url = str((thumb_node.get("url") if thumb_node is not None else "") or "").strip()

                fallback_updates.append(
                    {
                        "title": title,
                        "link": link or f"https://www.youtube.com/watch?v={video_id}",
                        "video_id": video_id,
                        "video_embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0&modestbranding=1&playsinline=1",
                        "published_at": published_at,
                        "source": channel,
                        "source_provider": "youtube",
                        "image_url": image_url,
                    }
                )
                seen_video_ids.add(video_id)
                if link:
                    seen_links.add(link)

                if len(fallback_updates) >= max(1, min(max_items, 120)):
                    return fallback_updates

        return fallback_updates[: max(1, min(max_items, 120))]
    except Exception:
        return []


def _safe_user_role_from_auth(authorization: Optional[str]) -> str:
    auth = str(authorization or "").strip()
    if not auth.lower().startswith("bearer "):
        return "farmer"

    token = auth.split(" ", 1)[1].strip()
    payload = decode_access_token(token) or {}
    role = str(payload.get("role") or "farmer").strip().lower()
    return role or "farmer"


def _tokenize_text(value: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9]+", str(value or "").lower()) if token]


def _prepare_search_terms(raw_terms: Optional[list[str]]) -> list[str]:
    unique_terms = list(dict.fromkeys([str(term or "").strip().lower() for term in (raw_terms or []) if str(term or "").strip()]))
    if not unique_terms:
        return []

    filtered = [term for term in unique_terms if term not in SEARCH_STOP_WORDS]
    candidate_terms = filtered or unique_terms

    specific_terms = [term for term in candidate_terms if term not in SEARCH_GENERIC_TERMS]
    return specific_terms or candidate_terms


def _is_agri_relevant(*, title: str, source: str = "", profile_terms: Optional[list[str]] = None, search_terms: Optional[list[str]] = None) -> bool:
    tokens = set(_tokenize_text(f"{title} {source}"))
    if not tokens:
        return False

    dynamic_terms = set(_tokenize_text(" ".join(profile_terms or [])))
    query_terms = set(_tokenize_text(" ".join(search_terms or [])))
    allowed_terms = AGRI_CORE_TERMS.union(dynamic_terms).union(query_terms)

    return bool(tokens.intersection(allowed_terms))


def _is_low_signal_video_title(title: str) -> bool:
    normalized = str(title or "").strip().lower()
    if not normalized:
        return True
    return any(pattern in normalized for pattern in LOW_SIGNAL_VIDEO_PATTERNS)


def _token_variants(token: str) -> set[str]:
    base = str(token or "").strip().lower()
    if not base:
        return set()
    variants = {base}
    if base.endswith("ies") and len(base) > 4:
        variants.add(f"{base[:-3]}y")
    if base.endswith("es") and len(base) > 4:
        variants.add(base[:-2])
    if base.endswith("s") and len(base) > 3:
        variants.add(base[:-1])
    variants.update(SEARCH_TERM_EQUIVALENTS.get(base, set()))
    return {item for item in variants if item}


def _matches_search_terms(*, title: str, source: str = "", search_terms: Optional[list[str]] = None) -> bool:
    terms = [str(term or "").strip().lower() for term in (search_terms or []) if str(term or "").strip()]
    if not terms:
        return True

    token_set = set(_tokenize_text(f"{title} {source}"))

    matched = 0
    for term in terms:
        variants = _token_variants(term)
        if not variants:
            continue
        if any(variant in token_set for variant in variants):
            matched += 1

    # Require stronger overlap for multi-term searches to avoid generic matches.
    if len(terms) <= 2:
        required_hits = 1
    elif len(terms) <= 4:
        required_hits = 2
    else:
        required_hits = max(2, math.ceil(len(terms) * 0.5))
    return matched >= required_hits


def _matches_search_terms_relaxed(*, title: str, source: str = "", search_terms: Optional[list[str]] = None) -> bool:
    terms = [str(term or "").strip().lower() for term in (search_terms or []) if str(term or "").strip()]
    if not terms:
        return True

    token_set = set(_tokenize_text(f"{title} {source}"))
    for term in terms:
        variants = _token_variants(term)
        if not variants:
            continue
        if any(variant in token_set for variant in variants):
            return True
    return False


def _is_livestock_noise(*, title: str, source: str = "", profile_terms: Optional[list[str]] = None, search_terms: Optional[list[str]] = None) -> bool:
    text_tokens = set(_tokenize_text(f"{title} {source}"))
    if not text_tokens:
        return False

    livestock_hits = text_tokens.intersection(LIVESTOCK_TERMS)
    if not livestock_hits:
        return False

    requested_terms = set(_tokenize_text(" ".join(profile_terms or []))).union(_tokenize_text(" ".join(search_terms or [])))
    user_wants_livestock = bool(requested_terms.intersection(LIVESTOCK_TERMS))

    return not user_wants_livestock


def _is_external_news_noise(*, title: str, source_provider: str = "", search_terms: Optional[list[str]] = None) -> bool:
    provider = str(source_provider or "").strip().lower()
    if provider not in {"newsapi", "newsdata_io"}:
        return False

    tokens = set(_tokenize_text(title))
    if not tokens:
        return True

    query_tokens = set(_tokenize_text(" ".join(search_terms or [])))
    if query_tokens and tokens.intersection(query_tokens):
        return False

    strong_agri_hits = tokens.intersection(EXTERNAL_NEWS_AGRI_STRONG_TERMS)
    noise_hits = tokens.intersection(EXTERNAL_NEWS_NOISE_TERMS)

    # Drop generic market-research style items when they are weak on farm intent.
    if noise_hits and len(strong_agri_hits) <= 1:
        return True

    return False


def _extract_image_url(item: ET.Element) -> str:
    """Extract image URL from RSS item."""
    # Try media:content
    media_content = item.find("{http://search.yahoo.com/mrss/}content")
    if media_content is not None and media_content.get("url"):
        return str(media_content.get("url")).strip()

    # Try media:thumbnail
    media_thumb = item.find("{http://search.yahoo.com/mrss/}thumbnail")
    if media_thumb is not None and media_thumb.get("url"):
        return str(media_thumb.get("url")).strip()

    # Try enclosure
    enclosure = item.find("enclosure")
    if enclosure is not None and enclosure.get("url"):
        url = str(enclosure.get("url")).strip()
        if any(url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]):
            return url

    # Try image tag in description
    description = item.findtext("description") or ""
    if description:
        import re as regex
        img_match = regex.search(r'<img[^>]+src=["\']([^"\'>]+)["\']', str(description))
        if img_match:
            return str(img_match.group(1)).strip()

        # Try src= without quotes
        img_match = regex.search(r'src=(http[^\s>]+)', str(description))
        if img_match:
            return str(img_match.group(1)).strip()

    return ""


def _title_key(title: str) -> str:
    tokens = _tokenize_text(title)
    if not tokens:
        return ""
    stop_words = {
        "india",
        "indian",
        "news",
        "today",
        "latest",
        "update",
        "farmer",
        "farmers",
    }
    filtered = [token for token in tokens if token not in stop_words]
    base = filtered if filtered else tokens
    return " ".join(base[:10])


def _jaccard_similarity(a_tokens: set[str], b_tokens: set[str]) -> float:
    if not a_tokens or not b_tokens:
        return 0.0
    overlap = len(a_tokens.intersection(b_tokens))
    union = len(a_tokens.union(b_tokens))
    if union == 0:
        return 0.0
    return overlap / union


def _select_diverse_updates(ranked_updates: list[dict], limit: int) -> list[dict]:
    if len(ranked_updates) <= limit:
        return ranked_updates

    selected: list[dict] = []
    selected_token_sets: list[set[str]] = []

    for item in ranked_updates:
        title = str(item.get("title") or "")
        token_set = set(_tokenize_text(_title_key(title)))

        too_similar = False
        for existing in selected_token_sets:
            if _jaccard_similarity(token_set, existing) >= 0.65:
                too_similar = True
                break

        if not too_similar:
            selected.append(item)
            selected_token_sets.append(token_set)

        if len(selected) >= limit:
            return selected

    # If diversity filtering is too strict, fill remaining slots by score order.
    if len(selected) < limit:
        used_links = {str(item.get("link") or "") for item in selected}
        for item in ranked_updates:
            link = str(item.get("link") or "")
            if link in used_links:
                continue
            selected.append(item)
            used_links.add(link)
            if len(selected) >= limit:
                break

    return selected[:limit]


def _recency_score(pub_date: str) -> float:
    raw = str(pub_date or "").strip()
    if not raw:
        return 0.15
    try:
        published = _parse_datetime(raw)
        if published is None:
            return 0.15
        now = datetime.now(timezone.utc)
        hours = max(0.0, (now - published).total_seconds() / 3600.0)
        if hours <= 12:
            return 1.0
        if hours <= 24:
            return 0.9
        if hours <= 72:
            return 0.75
        if hours <= 168:
            return 0.55
        if hours <= 720:
            return 0.25
        if hours <= 2160:
            return 0.12
        return 0.04
    except Exception:
        return 0.15


def _parse_datetime(raw: str) -> Optional[datetime]:
    value = str(raw or "").strip()
    if not value:
        return None

    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        pass

    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _is_recent_update(pub_date: str, *, max_age_days: int = 120) -> bool:
    published = _parse_datetime(pub_date)
    if published is None:
        return False
    age = datetime.now(timezone.utc) - published
    return age.total_seconds() <= max_age_days * 24 * 3600


def _fetch_google_news_items(queries: list[str], language: str = "en", max_items: int = 12) -> list[dict]:
    lang_code = "hi" if language == "hi" else "en"
    region = "IN"

    try:
        updates: list[dict] = []
        seen_links: set[str] = set()

        for query in queries:
            rss_url = (
                "https://news.google.com/rss/search"
                f"?q={quote_plus(query)}&hl={lang_code}-{region}&gl={region}&ceid={region}:{lang_code}"
            )
            response = requests.get(rss_url, timeout=12)
            response.raise_for_status()
            root = ET.fromstring(response.content)
            items = root.findall("./channel/item")

            for item in items:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub_date = (item.findtext("pubDate") or "").strip()
                source_node = item.find("source")
                source_name = (source_node.text or "Google News") if source_node is not None else "Google News"
                image_url = _extract_image_url(item)

                if not title or not link or link in seen_links:
                    continue

                updates.append(
                    {
                        "title": title,
                        "link": link,
                        "published_at": pub_date,
                        "source": source_name,
                        "source_provider": "google_rss",
                        "image_url": image_url,
                    }
                )
                seen_links.add(link)

                if len(updates) >= max(1, min(max_items, 120)):
                    return updates

        return updates
    except Exception:
        return []


def _fetch_external_news_items(queries: list[str], language: str = "en", max_items: int = 12) -> list[dict]:
    lang_code = "hi" if language == "hi" else "en"
    updates: list[dict] = []
    seen_links: set[str] = set()
    per_query_limit = max(1, min(20, max_items))
    candidate_queries = [q for q in queries if str(q or "").strip()][:2]

    if SERPAPI_API_KEY:
        for query in candidate_queries:
            try:
                params = {
                    "engine": "bing_news",
                    "q": query,
                    "api_key": SERPAPI_API_KEY,
                    "cc": "IN",
                    "count": per_query_limit,
                }
                response = requests.get(SERPAPI_BASE_URL, params=params, timeout=4)
                response.raise_for_status()
                payload = response.json() or {}
                for item in payload.get("news_results", []):
                    title = str(item.get("title") or "").strip()
                    link = str(item.get("link") or item.get("url") or "").strip()
                    if not title or not link or link in seen_links:
                        continue
                    source_block = item.get("source")
                    if isinstance(source_block, dict):
                        source_name = str(source_block.get("name") or "SerpAPI Bing News").strip()
                    else:
                        source_name = str(source_block or "SerpAPI Bing News").strip()
                    updates.append(
                        {
                            "title": title,
                            "link": link,
                            "published_at": str(item.get("date") or item.get("published_at") or "").strip(),
                            "source": source_name,
                            "source_provider": "serpapi_bing_news",
                            "image_url": str(item.get("thumbnail") or item.get("thumbnail_url") or "").strip(),
                        }
                    )
                    seen_links.add(link)
                    if len(updates) >= max(1, min(max_items, 120)):
                        return updates
            except Exception:
                continue

    if NEWSAPI_KEY:
        for query in candidate_queries:
            try:
                params = {
                    "q": query,
                    "apiKey": NEWSAPI_KEY,
                    "language": "en" if lang_code == "hi" else lang_code,
                    "sortBy": "publishedAt",
                    "pageSize": per_query_limit,
                }
                response = requests.get("https://newsapi.org/v2/everything", params=params, timeout=4)
                response.raise_for_status()
                payload = response.json() or {}
                for item in payload.get("articles", []):
                    title = str(item.get("title") or "").strip()
                    link = str(item.get("url") or "").strip()
                    if not title or not link or link in seen_links:
                        continue
                    source_name = str((item.get("source") or {}).get("name") or "NewsAPI").strip()
                    updates.append(
                        {
                            "title": title,
                            "link": link,
                            "published_at": str(item.get("publishedAt") or "").strip(),
                            "source": source_name,
                            "source_provider": "newsapi",
                            "image_url": str(item.get("urlToImage") or "").strip(),
                        }
                    )
                    seen_links.add(link)
                    if len(updates) >= max(1, min(max_items, 120)):
                        return updates
            except Exception:
                continue

    if NEWSDATA_API_KEY:
        for query in candidate_queries:
            try:
                params = {
                    "apikey": NEWSDATA_API_KEY,
                    "q": query,
                    "language": lang_code,
                    "country": "in",
                    "size": per_query_limit,
                }
                response = requests.get("https://newsdata.io/api/1/news", params=params, timeout=4)
                response.raise_for_status()
                payload = response.json() or {}
                for item in payload.get("results", []):
                    title = str(item.get("title") or "").strip()
                    link = str(item.get("link") or "").strip()
                    if not title or not link or link in seen_links:
                        continue
                    source_name = str(item.get("source_id") or "NewsData").strip()
                    updates.append(
                        {
                            "title": title,
                            "link": link,
                            "published_at": str(item.get("pubDate") or "").strip(),
                            "source": source_name,
                            "source_provider": "newsdata_io",
                            "image_url": str(item.get("image_url") or "").strip(),
                        }
                    )
                    seen_links.add(link)
                    if len(updates) >= max(1, min(max_items, 120)):
                        return updates
            except Exception:
                continue

    return updates


def _fetch_agri_rss_items(
    *,
    location: str,
    search: str,
    max_items: int = 12,
) -> list[dict]:
    try:
        updates: list[dict] = []
        seen_links: set[str] = set()
        location_terms = set(_tokenize_text(location))
        search_terms = set(_prepare_search_terms(_tokenize_text(search)))
        agri_terms = {
            "farm",
            "farming",
            "farmer",
            "agri",
            "agriculture",
            "crop",
            "kisan",
            "mandi",
            "seed",
            "pest",
            "irrigation",
            "harvest",
            "weather",
            "subsidy",
        }

        for source_name, feed_url in AGRI_RSS_FEEDS:
            try:
                response = requests.get(feed_url, timeout=10)
                response.raise_for_status()
                root = ET.fromstring(response.content)
                items = root.findall("./channel/item")

                for item in items:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    pub_date = (item.findtext("pubDate") or "").strip()
                    description = (item.findtext("description") or "").strip()
                    full_text = f"{title} {description}".lower()
                    image_url = _extract_image_url(item)

                    if not title or not link or link in seen_links:
                        continue

                    text_tokens = set(_tokenize_text(full_text))
                    if not text_tokens.intersection(agri_terms):
                        continue

                    # Keep location/search-sensitive entries first while still allowing broad agri coverage.
                    strict_match = bool(text_tokens.intersection(location_terms) or text_tokens.intersection(search_terms))
                    if location_terms or search_terms:
                        if not strict_match and len(updates) > (max_items // 2):
                            continue

                    updates.append(
                        {
                            "title": title,
                            "link": link,
                            "published_at": pub_date,
                            "source": source_name,
                            "source_provider": "agri_rss",
                            "image_url": image_url,
                        }
                    )
                    seen_links.add(link)

                    if len(updates) >= max(1, min(max_items, 120)):
                        return updates
            except Exception:
                continue

        return updates
    except Exception:
        return []


def _fetch_youtube_news_items(queries: list[str], language: str = "en", max_items: int = 12) -> list[dict]:
    if not YOUTUBE_API_KEY:
        return _fetch_youtube_rss_items(queries=queries, max_items=max_items)

    try:
        updates: list[dict] = []
        seen_video_ids: set[str] = set()
        lang_code = "hi" if language == "hi" else "en"
        per_query_limit = max(1, min(25, max_items))

        for query in queries:
            params = {
                "key": YOUTUBE_API_KEY,
                "part": "snippet",
                "type": "video",
                "order": "date",
                "maxResults": per_query_limit,
                "q": query,
                "relevanceLanguage": lang_code,
                "regionCode": "IN",
                "safeSearch": "none",
            }
            response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=12)
            response.raise_for_status()
            payload = response.json() or {}

            for item in payload.get("items", []):
                id_data = item.get("id") or {}
                snippet = item.get("snippet") or {}
                video_id = str(id_data.get("videoId") or "").strip()
                if not video_id or video_id in seen_video_ids:
                    continue

                title = str(snippet.get("title") or "").strip()
                channel = str(snippet.get("channelTitle") or "YouTube").strip()
                published_at = str(snippet.get("publishedAt") or "").strip()
                thumbs = snippet.get("thumbnails") or {}
                image_url = ""
                for key in ["high", "medium", "default"]:
                    candidate = (thumbs.get(key) or {}).get("url")
                    if candidate:
                        image_url = str(candidate).strip()
                        break

                if not title:
                    continue

                updates.append(
                    {
                        "title": title,
                        "link": f"https://www.youtube.com/watch?v={video_id}",
                        "video_id": video_id,
                        "video_embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0&modestbranding=1&playsinline=1",
                        "published_at": published_at,
                        "source": channel,
                        "source_provider": "youtube",
                        "image_url": image_url,
                    }
                )
                seen_video_ids.add(video_id)

                if len(updates) >= max(1, min(max_items, 120)):
                    return updates

        if not updates:
            fallback_queries = [
                "India agriculture news",
                "kisan samachar",
                "farming mandi updates",
            ]
            for query in fallback_queries:
                params = {
                    "key": YOUTUBE_API_KEY,
                    "part": "snippet",
                    "type": "video",
                    "order": "date",
                    "maxResults": 10,
                    "q": query,
                    "relevanceLanguage": lang_code,
                    "regionCode": "IN",
                    "safeSearch": "none",
                }
                response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=12)
                response.raise_for_status()
                payload = response.json() or {}

                for item in payload.get("items", []):
                    id_data = item.get("id") or {}
                    snippet = item.get("snippet") or {}
                    video_id = str(id_data.get("videoId") or "").strip()
                    if not video_id or video_id in seen_video_ids:
                        continue

                    title = str(snippet.get("title") or "").strip()
                    channel = str(snippet.get("channelTitle") or "YouTube").strip()
                    published_at = str(snippet.get("publishedAt") or "").strip()
                    thumbs = snippet.get("thumbnails") or {}
                    image_url = ""
                    for key in ["high", "medium", "default"]:
                        candidate = (thumbs.get(key) or {}).get("url")
                        if candidate:
                            image_url = str(candidate).strip()
                            break

                    if not title:
                        continue

                    updates.append(
                        {
                            "title": title,
                            "link": f"https://www.youtube.com/watch?v={video_id}",
                            "video_id": video_id,
                            "video_embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0&modestbranding=1&playsinline=1",
                            "published_at": published_at,
                            "source": channel,
                            "source_provider": "youtube",
                            "image_url": image_url,
                        }
                    )
                    seen_video_ids.add(video_id)

                    if len(updates) >= max(1, min(max_items, 120)):
                        return updates

        if not updates:
            rss_updates = _fetch_youtube_rss_items(
                queries=[*queries, "India agriculture news", "kisan samachar", "farming mandi updates"],
                max_items=max_items,
            )
            if rss_updates:
                return rss_updates

        return updates
    except Exception:
        return _fetch_youtube_rss_items(queries=queries, max_items=max_items)


def _recommendation_score(
    title: str,
    published_at: str,
    profile_terms: list[str],
    location_terms: list[str],
    role_terms: list[str],
    search_terms: list[str],
) -> tuple[float, list[str]]:
    text_tokens = set(_tokenize_text(title))
    profile_hits = [term for term in profile_terms if term in text_tokens]
    location_hits = [term for term in location_terms if term in text_tokens]
    role_hits = [term for term in role_terms if term in text_tokens]
    search_hits = [term for term in search_terms if term in text_tokens]

    profile_ratio = (len(profile_hits) / max(1, len(set(profile_terms))))
    location_ratio = (len(location_hits) / max(1, len(set(location_terms)))) if location_terms else 0
    role_ratio = (len(role_hits) / max(1, len(set(role_terms)))) if role_terms else 0
    search_ratio = (len(search_hits) / max(1, len(set(search_terms)))) if search_terms else 0
    recency = _recency_score(published_at)

    linear_score = 0.35 + (1.65 * profile_ratio) + (1.05 * location_ratio) + (0.65 * role_ratio) + (1.25 * search_ratio) + (0.85 * recency)
    probability = 1 / (1 + math.exp(-linear_score))
    rounded = round(float(probability), 4)

    reasons = []
    if profile_hits:
        reasons.append(f"interest match: {', '.join(profile_hits[:3])}")
    if location_hits:
        reasons.append(f"location signal: {', '.join(location_hits[:2])}")
    if role_hits:
        reasons.append(f"role signal: {', '.join(role_hits[:2])}")
    if search_hits:
        reasons.append(f"search signal: {', '.join(search_hits[:2])}")
    if recency >= 0.9:
        reasons.append("fresh update")
    if not reasons:
        reasons.append("general agriculture relevance")

    return rounded, reasons


def _build_farmer_news_queries(location: str, role: str, interests: list[str], search: str = "", nearby_only: bool = False) -> list[str]:
    clean_location = str(location or "India").strip() or "India"
    role_terms = ROLE_INTEREST_HINTS.get(role, ROLE_INTEREST_HINTS["farmer"])
    top_interest = " ".join(interests[:3]).strip()
    role_hint = " ".join(role_terms[:3]).strip()
    search_hint = " ".join(_prepare_search_terms(_tokenize_text(search))[:4]).strip()

    location_segment = clean_location if (nearby_only or clean_location.lower() != "india") else "India"

    queries = [
        f"{location_segment} kisan agriculture news India",
        f"{location_segment} mandi crop price farming update",
        f"India agriculture policy subsidy weather crop advisory",
        f"{location_segment} {role_hint} agriculture",
    ]

    if top_interest:
        queries.insert(1, f"{location_segment} {top_interest} farming news")
    if search_hint:
        queries.insert(2, f"{location_segment} {search_hint} farming latest")

    # Preserve order while deduplicating.
    seen = set()
    result = []
    for item in queries:
        key = item.lower().strip()
        if key and key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _safe_json(text: str) -> dict:
    raw = str(text or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}


def _heuristic_ai_category(title: str) -> tuple[str, str, str]:
    text = str(title or "").lower()
    if any(token in text for token in ["subsidy", "scheme", "policy", "pm-kisan", "msp"]):
        return "Policy", "high", "Govt policy update can impact planning and margins"
    if any(token in text for token in ["mandi", "price", "rate", "futures", "market"]):
        return "Market", "high", "Price movement may affect selling timing"
    if any(token in text for token in ["rain", "weather", "monsoon", "heatwave", "flood", "drought"]):
        return "Weather", "high", "Weather risk may impact crop operations"
    if any(token in text for token in ["pest", "disease", "blight", "outbreak", "fungal"]):
        return "Crop Health", "medium", "Crop health update can prevent yield loss"
    if any(token in text for token in ["irrigation", "fertilizer", "seed", "sowing", "harvest"]):
        return "Farm Practice", "medium", "Operational update relevant for field planning"
    return "General", "low", "General agriculture update"


def _ai_enrich_news(
    updates: list[dict],
    *,
    role: str,
    location: str,
    language: str,
    interests: list[str],
) -> tuple[list[dict], dict]:
    if not updates:
        return updates, {
            "enabled": False,
            "source": "none",
            "summary": "",
            "farmer_action": "",
            "hot_topics": [],
        }

    service = get_sarvam_service()
    if not service.available:
        enriched = []
        for item in updates:
            category, priority, why = _heuristic_ai_category(str(item.get("title") or ""))
            enriched.append(
                {
                    **item,
                    "ai_category": category,
                    "ai_priority": priority,
                    "ai_why": why,
                }
            )
        return enriched, {
            "enabled": False,
            "source": "heuristic",
            "summary": "AI key unavailable, showing heuristic relevance.",
            "farmer_action": "Focus on high-priority market and weather headlines first.",
            "hot_topics": sorted(list({item.get("ai_category", "General") for item in enriched}))[:6],
        }

    lines = []
    for idx, item in enumerate(updates[:15], start=1):
        lines.append(f"{idx}. {str(item.get('title') or '').strip()}")

    prompt = (
        "You are an agriculture news intelligence assistant.\n"
        "Classify each headline and return STRICT JSON only.\n"
        "Required keys: summary, farmer_action, hot_topics, items.\n"
        "items must be an array of objects with keys: index, category, priority, why.\n"
        "category must be one of: Market, Weather, Policy, Crop Health, Farm Practice, General.\n"
        "priority must be one of: high, medium, low.\n"
        "Keep summary and farmer_action under 30 words each.\n"
        f"Role: {role}\n"
        f"Location: {location}\n"
        f"Language: {language}\n"
        f"Interests: {', '.join(interests) if interests else 'general farming'}\n"
        "Headlines:\n"
        + "\n".join(lines)
    )

    result = service.generate_text(
        system_prompt="Return valid JSON only. Do not add markdown.",
        user_prompt=prompt,
        temperature=0.2,
        max_tokens=700,
    )
    parsed = _safe_json(result.get("text", "")) if result.get("ok") else {}

    items_map: dict[int, dict] = {}
    for entry in parsed.get("items", []) if isinstance(parsed.get("items"), list) else []:
        if not isinstance(entry, dict):
            continue
        idx = int(entry.get("index", 0) or 0)
        if idx <= 0:
            continue
        items_map[idx] = {
            "ai_category": str(entry.get("category") or "General").strip() or "General",
            "ai_priority": str(entry.get("priority") or "low").strip().lower() or "low",
            "ai_why": str(entry.get("why") or "General agriculture relevance").strip() or "General agriculture relevance",
        }

    enriched_updates: list[dict] = []
    for idx, item in enumerate(updates, start=1):
        ai_bits = items_map.get(idx)
        if not ai_bits:
            category, priority, why = _heuristic_ai_category(str(item.get("title") or ""))
            ai_bits = {
                "ai_category": category,
                "ai_priority": priority,
                "ai_why": why,
            }

        enriched_updates.append({**item, **ai_bits})

    return enriched_updates, {
        "enabled": bool(result.get("ok")),
        "source": str(result.get("source") or "heuristic"),
        "summary": str(parsed.get("summary") or "AI summarized top agricultural signals from live news."),
        "farmer_action": str(parsed.get("farmer_action") or "Track high-priority weather and market updates for immediate action."),
        "hot_topics": parsed.get("hot_topics") if isinstance(parsed.get("hot_topics"), list) else sorted(
            list({item.get("ai_category", "General") for item in enriched_updates})
        )[:6],
    }


def _fetch_weather_news(location: str, language: str = "en", max_items: int = 8) -> list[dict]:
    queries = [
        f"{location} weather agriculture farming India",
        f"{location} mausam kheti India",
        "India weather farming advisory",
        "India monsoon crop weather update",
    ]
    youtube_updates = _fetch_youtube_news_items(queries=queries, language=language, max_items=max_items)
    if youtube_updates:
        return youtube_updates[:max_items]

    google_updates = _fetch_google_news_items(queries=queries, language=language, max_items=max_items)
    external_updates = _fetch_external_news_items(queries=queries, language=language, max_items=max_items)

    merged = []
    seen_links = set()
    for item in [*youtube_updates, *google_updates, *external_updates]:
        link = str(item.get("link") or "").strip()
        if not link or link in seen_links:
            continue
        merged.append(item)
        seen_links.add(link)
        if len(merged) >= max_items:
            break

    return merged


def _simplify_location(loc: str) -> str:
    """Reduce a full postal address to a geocodable 'City, Country' string.

    Strips house-number prefixes (e.g. NH326A), PIN/ZIP codes (pure digits),
    and reduces to the first meaningful part + last part (country).
    """
    parts = [p.strip() for p in loc.split(",") if p.strip()]
    if len(parts) <= 2:
        return loc  # already concise
    # Drop parts that are pure digits (PIN) or road/house codes (≤8 alphanum chars)
    meaningful = [
        p for p in parts
        if not re.fullmatch(r"[\d\s]+", p)
        and not re.match(r"^[A-Z]{0,3}\d+[A-Z0-9]*$", p.upper())
        and len(p) > 3
    ]
    if not meaningful:
        return loc
    city = meaningful[0]
    country = parts[-1]
    return f"{city}, {country}" if country.lower() != city.lower() else city


def _location_candidates(loc: str) -> list[str]:
    coord_match = re.match(r"^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$", loc or "")
    if coord_match:
        return [loc.strip()]

    parts = [p.strip() for p in loc.split(",") if p.strip()]
    meaningful = [
        p for p in parts
        if not re.fullmatch(r"[\d\s]+", p)
        and not re.match(r"^[A-Z]{0,3}\d+[A-Z0-9]*$", p.upper())
        and len(p) > 2
    ]

    candidates: list[str] = []

    def add(v: str) -> None:
        item = v.strip()
        if item and item not in candidates:
            candidates.append(item)

    add(loc)
    add(_simplify_location(loc))

    if meaningful:
        country = meaningful[-1]
        city = meaningful[0]
        add(f"{city}, {country}")

    if len(meaningful) >= 2:
        state = meaningful[-2]
        add(f"{meaningful[0]}, {state}, {meaningful[-1]}")

    if len(meaningful) >= 3:
        # Try middle locality and district/state variants
        add(f"{meaningful[1]}, {meaningful[-2]}, {meaningful[-1]}")
        add(f"{meaningful[-3]}, {meaningful[-2]}, {meaningful[-1]}")

    if len(meaningful) >= 2:
        state = meaningful[-2]
        add(f"{state}, {meaningful[-1]}")

    if meaningful:
        add(meaningful[-1])

    return candidates


def _expected_country(loc: str) -> str:
    coord_match = re.match(r"^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$", loc or "")
    if coord_match:
        return ""

    parts = [p.strip() for p in loc.split(",") if p.strip()]
    if len(parts) < 2:
        return ""

    tail = parts[-1]
    if re.fullmatch(r"[\d\s]+", tail):
        return ""

    tail_lower = tail.lower()
    # Enforce country matching only when explicit country value/code is provided.
    explicit_country_values = {
        "in",
        "india",
        "bharat",
        "us",
        "usa",
        "uk",
        "uae",
        "au",
        "ca",
    }
    if tail_lower in explicit_country_values or re.fullmatch(r"[a-z]{2}", tail_lower):
        return tail
    return ""


def _country_matches(expected: str, actual: str) -> bool:
    exp = (expected or "").strip().lower()
    act = (actual or "").strip().lower()
    if not exp or not act:
        return True

    # Handle common code/name variants.
    aliases = {
        "india": {"india", "in"},
        "in": {"india", "in"},
    }
    exp_set = aliases.get(exp, {exp})
    act_set = aliases.get(act, {act})
    return bool(exp_set.intersection(act_set)) or exp in act or act in exp




class WeatherSubscription(BaseModel):
    farmer_name: str = Field(..., min_length=2)
    phone: str = Field(..., min_length=8)
    location: str = Field(..., min_length=2)
    language: str = Field(default="en")
    channel: str = Field(default="sms")
    risk_level: str = Field(default="medium")


@router.get("/health")
def weather_health():
    service = get_weather_service()
    return {
        "status": "success",
        "data": {
            "openweather_configured": service.available,
            "subscribers": len(list_weather_subscribers()),
            "twilio_configured": bool(
                service.twilio_account_sid and service.twilio_auth_token and service.twilio_from_number
            ),
            "scheduler": weather_scheduler_status(),
        },
    }


@router.get("/forecast")
def weather_forecast(
    location: str = Query(..., description="City or city,state (e.g. Pune,IN)"),
    days: int = Query(7, ge=1, le=10),
    units: str = Query("metric", description="metric or imperial"),
):
    service = get_weather_service()
    try:
        data = None
        last_error = None
        expected_country = _expected_country(location)
        for candidate in _location_candidates(location):
            try:
                possible = service.get_forecast(location=candidate, days=days, units=units)
                actual_country = str((possible.get("location") or {}).get("country") or "")
                if not _country_matches(expected_country, actual_country):
                    continue
                data = possible
                break
            except ValueError as exc:
                last_error = exc
                continue

        if data is None:
            raise ValueError(str(last_error or f"Location not found: {location}"))
        return {
            "status": "success",
            "data": data,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Forecast fetch failed: {exc}")


@router.post("/subscribe")
def subscribe_weather_alert(payload: WeatherSubscription):
    created = add_weather_subscriber(payload.dict())
    return {
        "status": "success",
        "message": "Weather alert subscription created.",
        "data": created,
    }


@router.get("/subscribers")
def get_subscribers():
    return {
        "status": "success",
        "data": list_weather_subscribers(),
    }


@router.post("/check-alerts")
def check_weather_alerts(
    location: str = Query(..., description="Location for weather checks"),
    days: int = Query(7, ge=1, le=10),
    min_risk: str = Query("medium", description="low/medium/high"),
    send_sms: bool = Query(False, description="Send SMS/webhook notifications"),
    only_phone: Optional[str] = Query(None, description="Optional: alert only this phone"),
):
    service = get_weather_service()

    try:
        forecast = service.get_forecast(location=location, days=days)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to check alerts: {exc}")

    risk_order = {"low": 1, "medium": 2, "high": 3}
    threshold = risk_order.get(min_risk.lower(), 2)

    risky_days = []
    for day in forecast.get("daily_forecast", []):
        level = day.get("risk", {}).get("risk_level", "low")
        if risk_order.get(level, 1) >= threshold:
            risky_days.append(day)

    subs = list_weather_subscribers()
    if only_phone:
        subs = [s for s in subs if str(s.get("phone")) == str(only_phone)]

    notifications = []
    for sub in subs:
        message = (
            f"Weather alert for {location}: {len(risky_days)} risk day(s) in next {days} days. "
            f"Top advisory: {forecast.get('risk_summary', {}).get('advisory', '')}"
        )

        status = {
            "sent": False,
            "provider": "disabled",
        }
        if send_sms and risky_days:
            status = service.trigger_sms_notification(str(sub.get("phone")), message)

        notifications.append(
            {
                "subscriber_id": sub.get("id"),
                "farmer_name": sub.get("farmer_name"),
                "phone": sub.get("phone"),
                "location": sub.get("location"),
                "message": message,
                "notification_status": status,
            }
        )

    return {
        "status": "success",
        "data": {
            "location": location,
            "days_checked": days,
            "risk_filter": min_risk,
            "risky_days": risky_days,
            "notifications": notifications,
        },
    }


@router.post("/run-daily-job")
def run_weather_daily_job_now():
    result = run_daily_weather_alert_job()
    return {
        "status": "success",
        "data": result,
    }


@router.get("/news")
def weather_news(
    location: str = Query(..., description="Location for weather news context"),
    language: str = Query("en", description="en or hi"),
    limit: int = Query(8, ge=1, le=20),
):
    updates = _fetch_weather_news(location=location, language=language, max_items=limit)
    return {
        "status": "success",
        "data": {
            "location": location,
            "language": language,
            "count": len(updates),
            "updates": updates,
        },
    }


@router.get("/farmer-news")
def personalized_farmer_news(
    location: str = Query("India", description="Location for personalized agriculture news"),
    language: str = Query("en", description="en or hi"),
    limit: int = Query(12, ge=1, le=30),
    offset: int = Query(0, ge=0, le=500),
    feed_tab: str = Query("all", description="all, videos, articles"),
    interests: str = Query("", description="Comma separated interests, e.g. wheat,irrigation,subsidy"),
    search: str = Query("", description="Search query for custom farming headlines"),
    nearby_only: bool = Query(False, description="Prioritize nearby/location-focused farming news"),
    role: Optional[str] = Query(None, description="Optional role override for recommendation profile"),
    ai_enrich: bool = Query(True, description="Enable AI intelligence layer (summary, categories, priorities)"),
    authorization: Optional[str] = Header(default=None),
):
    detected_role = (role or _safe_user_role_from_auth(authorization)).strip().lower() or "farmer"
    role_interest_hints = ROLE_INTEREST_HINTS.get(detected_role, ROLE_INTEREST_HINTS["farmer"])
    interest_list = [token.strip().lower() for token in str(interests or "").split(",") if token.strip()]
    search_terms = _prepare_search_terms(_tokenize_text(search))
    profile_terms = list(dict.fromkeys([*interest_list, *role_interest_hints]))
    queries = _build_farmer_news_queries(
        location=location,
        role=detected_role,
        interests=interest_list,
        search=search,
        nearby_only=nearby_only,
    )

    fetch_window = max(1, min(120, limit + offset + 60))
    youtube_updates = _fetch_youtube_news_items(queries=queries, language=language, max_items=fetch_window)
    google_updates = _fetch_google_news_items(queries=queries, language=language, max_items=fetch_window)
    external_updates = _fetch_external_news_items(queries=queries, language=language, max_items=fetch_window)
    serpapi_updates_count = len([
        item for item in external_updates
        if str(item.get("source_provider") or "").strip().lower() == "serpapi_bing_news"
    ])
    agri_rss_updates = _fetch_agri_rss_items(location=location, search=search, max_items=fetch_window)

    source_candidates = [*youtube_updates, *google_updates, *external_updates, *agri_rss_updates]

    merged_updates = []
    seen_links = set()
    seen_title_keys = set()
    for item in source_candidates:
        link = str(item.get("link") or "").strip()
        title_key = _title_key(str(item.get("title") or ""))
        if not link or link in seen_links:
            continue
        if title_key and title_key in seen_title_keys:
            continue
        merged_updates.append(item)
        seen_links.add(link)
        if title_key:
            seen_title_keys.add(title_key)

    agri_relevant_updates = [
        item
        for item in merged_updates
        if _is_agri_relevant(
            title=str(item.get("title") or ""),
            source=str(item.get("source") or ""),
            profile_terms=profile_terms,
            search_terms=search_terms,
        )
    ]

    if agri_relevant_updates:
        merged_updates = agri_relevant_updates
    elif agri_rss_updates:
        # If mixed sources are too generic, keep focused agriculture RSS items.
        merged_updates = agri_rss_updates

    recent_updates = [
        item for item in merged_updates
        if _is_recent_update(str(item.get("published_at") or ""), max_age_days=120)
    ]
    if recent_updates:
        merged_updates = recent_updates

    if nearby_only and location.strip():
        loc_tokens = set(_tokenize_text(location))
        nearby_filtered = []
        for item in merged_updates:
            title_tokens = set(_tokenize_text(str(item.get("title") or "")))
            if title_tokens.intersection(loc_tokens):
                nearby_filtered.append(item)
        if nearby_filtered:
            merged_updates = nearby_filtered

    # Drop livestock-only noise unless user explicitly asked for livestock/dairy topics.
    merged_updates = [
        item
        for item in merged_updates
        if not _is_livestock_noise(
            title=str(item.get("title") or ""),
            source=str(item.get("source") or ""),
            profile_terms=profile_terms,
            search_terms=search_terms,
        )
    ]

    # Suppress generic external business-news noise unless query strongly asks for it.
    merged_updates = [
        item
        for item in merged_updates
        if not _is_external_news_noise(
            title=str(item.get("title") or ""),
            source_provider=str(item.get("source_provider") or ""),
            search_terms=search_terms,
        )
    ]

    # When user searches, keep strict matching first, then allow controlled relaxed fallback.
    if search_terms:
        pre_search_pool = list(merged_updates)
        strict_search_updates = [
            item
            for item in merged_updates
            if _matches_search_terms(
                title=str(item.get("title") or ""),
                source=str(item.get("source") or ""),
                search_terms=search_terms,
            )
        ]

        if len(strict_search_updates) < 2:
            relaxed_candidates = [
                item
                for item in pre_search_pool
                if _matches_search_terms_relaxed(
                    title=str(item.get("title") or ""),
                    source=str(item.get("source") or ""),
                    search_terms=search_terms,
                )
            ]

            seen_relaxed_links = {str(item.get("link") or "") for item in strict_search_updates}
            for item in relaxed_candidates:
                link = str(item.get("link") or "")
                if link in seen_relaxed_links:
                    continue
                strict_search_updates.append(item)
                seen_relaxed_links.add(link)
                if len(strict_search_updates) >= 4:
                    break

        merged_updates = strict_search_updates

    location_terms = _tokenize_text(location)
    role_terms = _tokenize_text(" ".join(role_interest_hints[:4]))
    ranked_updates = []
    for item in merged_updates:
        score, reasons = _recommendation_score(
            title=str(item.get("title") or ""),
            published_at=str(item.get("published_at") or ""),
            profile_terms=profile_terms,
            location_terms=location_terms,
            role_terms=role_terms,
            search_terms=search_terms,
        )
        enriched = {
            **item,
            "recommendation_score": score,
            "recommendation_reasons": reasons,
        }
        ranked_updates.append(enriched)

    ranked_updates.sort(key=lambda record: record.get("recommendation_score", 0), reverse=True)
    ranked_updates = _select_diverse_updates(ranked_updates, fetch_window)

    ai_meta = {
        "enabled": False,
        "source": "disabled",
        "summary": "",
        "farmer_action": "",
        "hot_topics": [],
    }
    if ai_enrich:
        ranked_updates, ai_meta = _ai_enrich_news(
            ranked_updates,
            role=detected_role,
            location=location,
            language=language,
            interests=profile_terms,
        )

    normalized_feed_tab = str(feed_tab or "all").strip().lower()
    if normalized_feed_tab not in {"all", "videos", "articles"}:
        normalized_feed_tab = "all"

    if normalized_feed_tab == "videos":
        ranked_updates = [
            item for item in ranked_updates
            if str(item.get("source_provider") or "").strip().lower() == "youtube"
        ]

        if search_terms:
            ranked_updates = [
                item
                for item in ranked_updates
                if _matches_search_terms(
                    title=str(item.get("title") or ""),
                    source=str(item.get("source") or ""),
                    search_terms=search_terms,
                )
            ]

        if not ranked_updates:
            # Dedicated fallback for videos tab: use recent YouTube candidates directly.
            query_token_set = set(search_terms)
            recent_video_candidates = [
                item
                for item in youtube_updates
                if _is_recent_update(str(item.get("published_at") or ""), max_age_days=2000)
                and not _is_low_signal_video_title(str(item.get("title") or ""))
                and (
                    _is_agri_relevant(
                        title=str(item.get("title") or ""),
                        source=str(item.get("source") or ""),
                        profile_terms=profile_terms,
                        search_terms=search_terms,
                    )
                    or (
                        query_token_set
                        and bool(set(_tokenize_text(str(item.get("title") or ""))).intersection(query_token_set))
                    )
                )
            ]

            fallback_ranked: list[dict] = []
            for item in recent_video_candidates:
                score, reasons = _recommendation_score(
                    title=str(item.get("title") or ""),
                    published_at=str(item.get("published_at") or ""),
                    profile_terms=profile_terms,
                    location_terms=location_terms,
                    role_terms=role_terms,
                    search_terms=search_terms,
                )
                fallback_ranked.append(
                    {
                        **item,
                        "recommendation_score": score,
                        "recommendation_reasons": reasons,
                    }
                )

            fallback_ranked.sort(key=lambda record: record.get("recommendation_score", 0), reverse=True)
            fallback_ranked = _select_diverse_updates(fallback_ranked, fetch_window)

            if ai_enrich and fallback_ranked:
                fallback_ranked, ai_meta = _ai_enrich_news(
                    fallback_ranked,
                    role=detected_role,
                    location=location,
                    language=language,
                    interests=profile_terms,
                )

            ranked_updates = fallback_ranked
    elif normalized_feed_tab == "articles":
        ranked_updates = [
            item for item in ranked_updates
            if str(item.get("source_provider") or "").strip().lower() != "youtube"
        ]

    total_available = len(ranked_updates)
    paged_updates = ranked_updates[offset: offset + limit]
    has_more = total_available > (offset + len(paged_updates))

    return {
        "status": "success",
        "data": {
            "location": location,
            "language": language,
            "role_profile": detected_role,
            "profile_terms": profile_terms[:12],
            "aggregation_meta": {
                "youtube_count": len(youtube_updates),
                "youtube_configured": bool(YOUTUBE_API_KEY),
                "youtube_used": bool(youtube_updates),
                "google_news_count": len(google_updates),
                "external_news_count": len(external_updates),
                "serpapi_news_count": serpapi_updates_count,
                "agri_rss_count": len(agri_rss_updates),
                "merged_count": total_available,
                "mode": "mixed" if youtube_updates and (google_updates or external_updates or agri_rss_updates) else ("youtube_primary" if youtube_updates else ("multi_source" if (google_updates or external_updates) and agri_rss_updates else "fallback")),
                "search_query": search,
                "nearby_only": nearby_only,
                "feed_tab": normalized_feed_tab,
                "offset": offset,
                "limit": limit,
                "has_more": has_more,
            },
            "ai_meta": ai_meta,
            "count": len(paged_updates),
            "updates": paged_updates,
        },
    }
