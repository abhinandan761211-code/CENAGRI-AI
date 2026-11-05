"""On-demand translation providers.

Used ONLY for dynamic content a user explicitly asks to translate — a CenFriend
post, a product description. Static interface strings never come through here;
they are prebuilt and reviewed in ``frontend/src/i18n/locales``.

Design rules
------------
* **No silent wrong-language output.** If no provider is configured, or the
  provider fails, the result is ``ok=False`` and the caller must show the
  original text as-is. We never return the input and label it a translation.
* **Codes stay inside this layer.** ``app.core.languages.to_provider`` is the
  only place an ``od-IN``-style tag is produced.
* **Cached.** Identical text/target pairs are reused, so translating a busy post
  costs one call, not one per reader.
* **Server-side credentials only.** Keys live in the backend environment; React
  never sees them.

Providers
---------
``sarvam`` — dedicated translation API, best quality/precision for Indic scripts.
``gemini`` — general LLM used as a translation engine; used when Sarvam is not
             available on the account. It is prompted to answer with the
             translation only, and a reply that does not look like a translation
             is rejected rather than shown.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.languages import LanguageCode

log = logging.getLogger(__name__)

#: Small in-process cache. Bounded so a long-running server cannot grow forever.
_CACHE_TTL_SECONDS = 6 * 60 * 60
_CACHE_MAX_ENTRIES = 2000
_cache: dict[str, tuple[float, "Result"]] = {}


@dataclass
class Result:
    text: str
    ok: bool
    cached: bool = False
    provider: str | None = None


def configured_provider() -> str | None:
    """The active provider name, or None when translation is switched off."""
    name = (getattr(settings, "TRANSLATE_PROVIDER", "") or "").strip().lower()
    if not name:
        return None
    if not getattr(settings, "TRANSLATE_API_KEY", ""):
        log.warning("TRANSLATE_PROVIDER=%s is set but TRANSLATE_API_KEY is empty", name)
        return None
    if name not in _PROVIDERS:
        # Fail loudly rather than silently behaving as if translation were off.
        log.warning(
            "TRANSLATE_PROVIDER=%s is not supported; expected one of %s",
            name,
            sorted(_PROVIDERS),
        )
        return None
    return name


def _cache_get(key: str) -> Result | None:
    hit = _cache.get(key)
    if not hit:
        return None
    stored_at, result = hit
    if time.time() - stored_at > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return Result(text=result.text, ok=result.ok, cached=True, provider=result.provider)


def _cache_put(key: str, result: Result) -> None:
    if len(_cache) >= _CACHE_MAX_ENTRIES:
        # Drop the oldest entry; a coarse eviction is enough for a cost guard.
        oldest = min(_cache.items(), key=lambda item: item[1][0])[0]
        _cache.pop(oldest, None)
    _cache[key] = (time.time(), result)


async def _sarvam(text: str, source: LanguageCode, target: LanguageCode) -> str:
    """Sarvam Translate. Returns the translated text or raises."""
    url = "https://api.sarvam.ai/translate"
    headers = {"api-subscription-key": settings.TRANSLATE_API_KEY, "Content-Type": "application/json"}
    model = (getattr(settings, "TRANSLATE_MODEL", "") or _DEFAULT_SARVAM_MODEL).strip()
    payload = {
        # Provider tags, produced only by the mapping layer.
        "source_language_code": _sarvam_tag(source),
        "target_language_code": _sarvam_tag(target),
        "input": text,
        "speaker_gender": "Male",
        "mode": "formal",
        "model": model,
        "enable_preprocessing": True,
    }
    timeout = getattr(settings, "TRANSLATE_TIMEOUT_SECONDS", 12.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload, headers=headers)
    if response.status_code >= 400:
        raise ValueError(f"sarvam returned {response.status_code}: {response.text[:200]}")
    data = response.json()
    out = (data.get("translated_text") or "").strip()
    if not out:
        raise ValueError("provider returned an empty translation")
    return out


#: ``sarvam-translate:v1`` covers every language in the picker; ``mayura:v1``
#: rejects Assamese (as-IN) and Urdu (ur-IN) with a 400, and silently differs on
#: Odia. Verified against the live API, so this is the default.
_DEFAULT_SARVAM_MODEL = "sarvam-translate:v1"


def _sarvam_tag(code: str) -> str:
    """App code → Sarvam tag for ANY of the 22 languages.

    ``app.core.languages`` is typed to the four first-class languages (en/hi/or/
    bn), so it cannot express Tamil, Urdu and the rest. Sarvam also spells Odia
    ``od-IN``, not the BCP-47 ``or-IN`` — passing ``or-IN`` back is a 400.
    """
    if code == "or":
        return "od-IN"
    if code == "en":
        return "en-IN"
    return f"{code}-IN"


#: Model used when the provider is Gemini. Flash is the cheapest model that still
#: handles all 22 scheduled languages; override with TRANSLATE_MODEL.
_DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"

#: Full names matter here — "Hindi" translates better than "hi", and the model
#: needs the script name to pick the right writing system for Urdu/Santali.
_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "hi": "Hindi (Devanagari script)",
    "bn": "Bengali (Bangla script)",
    "or": "Odia (Odia script)",
    "ta": "Tamil (Tamil script)",
    "te": "Telugu (Telugu script)",
    "mr": "Marathi (Devanagari script)",
    "gu": "Gujarati (Gujarati script)",
    "kn": "Kannada (Kannada script)",
    "ml": "Malayalam (Malayalam script)",
    "pa": "Punjabi (Gurmukhi script)",
    "as": "Assamese (Assamese script)",
    "ur": "Urdu (Nastaliq/Arabic script)",
    "doi": "Dogri (Devanagari script)",
    "ks": "Kashmiri (Arabic script)",
    "kok": "Konkani (Devanagari script)",
    "mai": "Maithili (Devanagari script)",
    "mni": "Manipuri (Bengali script)",
    "ne": "Nepali (Devanagari script)",
    "sa": "Sanskrit (Devanagari script)",
    "sat": "Santali (Ol Chiki script)",
    "sd": "Sindhi (Arabic script)",
}


def _language_name(code: str) -> str:
    return _LANGUAGE_NAMES.get(code, code)


async def _gemini(text: str, source: LanguageCode, target: LanguageCode) -> str:
    """Translate with Gemini. Returns the translation or raises.

    The prompt forbids commentary, transliteration and explanation. Any reply
    carrying a preamble, a markdown fence or a suspiciously long explanation is
    treated as a failure, so the caller shows the original text instead of a
    half-answer.
    """
    model = (getattr(settings, "TRANSLATE_MODEL", "") or _DEFAULT_GEMINI_MODEL).strip()
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )

    target_name = _language_name(target)
    source_part = (
        "The source text is in English."
        if source == "en"
        else f"The source text is in {_language_name(source)}."
    )
    prompt = (
        f"You are a professional translator for an Indian agriculture app.\n"
        f"{source_part}\n"
        f"Translate the text below into {target_name}.\n\n"
        "Rules:\n"
        "1. Reply with the translation ONLY. No notes, no explanations, no quotes.\n"
        "2. Use the standard script for the target language.\n"
        "3. Keep numbers, units (kg, quintal, acre), crop names, mandi names and\n"
        "   government scheme names unchanged when they would be unclear otherwise.\n"
        "4. Keep placeholders in curly braces exactly as written, e.g. {name}.\n"
        "5. Keep the original punctuation and line breaks.\n\n"
        f"TEXT:\n{text}"
    )

    headers = {"x-goog-api-key": settings.TRANSLATE_API_KEY, "Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        # Deterministic output: the same string must translate identically for
        # every reader, and the interface dictionary depends on that stability.
        "generationConfig": {"temperature": 0, "maxOutputTokens": 2048},
    }

    timeout = getattr(settings, "TRANSLATE_TIMEOUT_SECONDS", 12.0)
    data = await _post_with_retry(url, payload, headers, timeout)

    candidates = data.get("candidates") or []
    if not candidates:
        reason = (data.get("promptFeedback") or {}).get("blockReason")
        raise ValueError(f"gemini returned no candidates (blockReason={reason})")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    # A reasoning model may emit a thought part first; only plain text parts count.
    out = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
    out = _clean_translation(out)
    if not out:
        raise ValueError("gemini returned an empty translation")
    return out


def _clean_translation(text: str) -> str:
    """Strip wrapping a model sometimes adds, and reject obvious non-translations."""
    out = text.strip()

    # ```...``` fences around the whole answer.
    if out.startswith("```") and out.endswith("```"):
        out = out.strip("`").strip()
        # Drop a leading language tag such as ```hindi
        first_break = out.find("\n")
        if first_break > 0 and " " not in out[:first_break]:
            out = out[first_break + 1 :].strip()

    # Leading label like "Translation:" / "Hindi:".
    lowered = out.lower()
    for prefix in ("translation:", "translated text:", "output:"):
        if lowered.startswith(prefix):
            out = out[len(prefix) :].strip()
            break

    # Whole answer wrapped in straight or curly quotes.
    quotes = "\"'“”„"
    if len(out) >= 2 and out[0] in quotes and out[-1] in quotes:
        out = out[1:-1].strip()

    return out


async def _post_with_retry(
    url: str, payload: dict, headers: dict, timeout: float, attempts: int = 3
) -> dict:
    """POST and retry only on errors that are worth retrying.

    429 (rate limit) and 5xx are transient for an LLM endpoint, so they get a
    short exponential backoff. 400/401/403 are permanent — retrying would just
    burn quota, so they surface immediately and the caller shows the original
    text (see ``translate``, which turns any exception into ``ok=False``).
    """
    delay = 0.6
    last: Exception | None = None
    for attempt in range(attempts):
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
        if response.status_code < 400:
            return response.json()
        body = response.text[:200]
        if response.status_code not in (429, 500, 502, 503, 504):
            raise ValueError(f"translate provider returned {response.status_code}: {body}")
        last = ValueError(f"translate provider returned {response.status_code}: {body}")
        if attempt < attempts - 1:
            await asyncio.sleep(delay)
            delay *= 2
    assert last is not None
    raise last


#: A burst of CenFriend posts must not trip the provider's per-minute quota for
#: the whole account, so only a few translations run at once.
_CONCURRENCY = asyncio.Semaphore(4)


_PROVIDERS = {"sarvam": _sarvam, "gemini": _gemini}


async def translate(
    *,
    text: str,
    source: LanguageCode,
    target: LanguageCode,
    scope: str = "other",
    request_id: str = "",
) -> Result:
    """Translate ``text`` to ``target``. Never raises; reports failure in the result."""
    key = hashlib.sha256(f"{source}|{target}|{scope}|{text}".encode()).hexdigest()
    hit = _cache_get(key)
    if hit:
        return hit

    provider = configured_provider()
    if not provider or provider not in _PROVIDERS:
        # Nothing configured: say so instead of echoing the input as a "translation".
        return Result(text=text, ok=False, provider=None)

    try:
        async with _CONCURRENCY:
            out = await _PROVIDERS[provider](text, source, target)
    except Exception as exc:  # noqa: BLE001 - any provider failure is a soft failure here
        log.warning("translate failed request=%s provider=%s: %s", request_id, provider, exc)
        return Result(text=text, ok=False, provider=provider)

    result = Result(text=out, ok=True, provider=provider)
    _cache_put(key, result)
    return result
