"""One place that knows what a language code means.

Every layer of the backend (API schemas, the AI bridge, the translation
provider adapters, caching) speaks the app's own codes: ``en``, ``hi``, ``or``,
``bn``. Provider-specific tags (``od-IN`` for Sarvam, ``or-IN`` for Azure …)
are produced ONLY here, when a provider is called.

That keeps two promises:

1. A new provider is added by extending one dictionary, not by hunting for
   hard-coded tags across routes.
2. A language is only reported as supported for a capability that was actually
   implemented and tested for it — see ``CAPABILITIES``. Voice and OCR are not
   inferred from chat support.

Keep this in step with ``frontend/src/i18n/capabilities.ts``; the two tables
describe the same product, so a change in one is a change in both.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

LanguageCode = Literal["en", "hi", "or", "bn"]

#: Languages the product ships with reviewed interface strings.
SUPPORTED: Final[tuple[LanguageCode, ...]] = ("en", "hi", "or", "bn")

#: The fallback for every capability.
DEFAULT: Final[LanguageCode] = "en"

#: Human names, used in prompts and in API metadata.
DISPLAY_NAMES: Final[dict[LanguageCode, str]] = {
    "en": "English",
    "hi": "Hindi",
    "or": "Odia",
    "bn": "Bengali",
}


@dataclass(frozen=True)
class Capability:
    ui: bool
    chat: bool
    translation: bool
    retrieval: bool
    stt: bool = False
    tts: bool = False
    ocr: bool = False


#: Voice and OCR stay off until a provider is wired and tested per language.
CAPABILITIES: Final[dict[LanguageCode, Capability]] = {
    "en": Capability(ui=True, chat=True, translation=True, retrieval=True, ocr=True),
    "hi": Capability(ui=True, chat=True, translation=True, retrieval=True, ocr=True),
    "or": Capability(ui=True, chat=True, translation=True, retrieval=True, ocr=True),
    "bn": Capability(ui=True, chat=True, translation=True, retrieval=True, ocr=True),
}


class ProviderCode(str):
    """Marker type for a provider tag, so it is obvious where one may be used."""


#: internal code → provider tag. A missing entry falls back to ``<code>-IN``.
PROVIDER_CODES: Final[dict[str, dict[LanguageCode, str]]] = {
    # Sarvam spells Odia "od-IN" (an older tag), not the BCP-47 "or-IN".
    "sarvam": {
        "en": "en-IN",
        "hi": "hi-IN",
        "or": "od-IN",
        "bn": "bn-IN",
    },
    "bhashini": {"en": "en", "hi": "hi", "or": "or", "bn": "bn"},
    "azure": {"en": "en-IN", "hi": "hi-IN", "or": "or-IN", "bn": "bn-IN"},
    "google": {"en": "en", "hi": "hi", "or": "or", "bn": "bn"},
    "internal": {"en": "en", "hi": "hi", "or": "or", "bn": "bn"},
}

#: Reverse tags that are NOT the plain "<code>-IN" form.
_REVERSE_EXTRAS: Final[dict[str, LanguageCode]] = {"od-in": "or", "ori": "or", "ory": "or"}


def normalize(code: str | None, fallback: LanguageCode = DEFAULT) -> LanguageCode:
    """Turn anything a client sends into one of our codes.

    Accepts ``hi``, ``hi-IN``, ``HI``, ``od-IN`` (provider spelling of Odia) and
    returns ``None``-safe output: an unknown language becomes the fallback, so a
    bad value can never reach the model as-is.
    """
    if not code:
        return fallback
    value = code.strip().lower().replace("_", "-")
    if value in SUPPORTED:
        return value  # type: ignore[return-value]
    if value in _REVERSE_EXTRAS:
        return _REVERSE_EXTRAS[value]
    base = value.split("-")[0]
    if base in SUPPORTED:
        return base  # type: ignore[return-value]
    return fallback


def is_supported(code: str | None) -> bool:
    """True when the tag maps to a language we ship."""
    if not code:
        return False
    value = code.strip().lower().replace("_", "-")
    return value in SUPPORTED or value in _REVERSE_EXTRAS or value.split("-")[0] in SUPPORTED


def display_name(code: str | None) -> str:
    return DISPLAY_NAMES[normalize(code)]


def to_provider(code: str | None, provider: str) -> ProviderCode:
    """App code → the tag that provider expects. Never call a provider without this."""
    lang = normalize(code)
    table = PROVIDER_CODES.get(provider)
    if table and lang in table:
        return ProviderCode(table[lang])
    return ProviderCode(f"{lang}-IN")


def supports(code: str | None, capability: str) -> bool:
    """Whether a capability is available for a language, per the matrix."""
    lang = normalize(code)
    caps = CAPABILITIES.get(lang)
    return bool(caps and getattr(caps, capability, False))


def matrix() -> list[dict[str, object]]:
    """The capability table, for the API/docs, built from the single source."""
    return [
        {
            "code": lang,
            "name": DISPLAY_NAMES[lang],
            **{
                key: getattr(CAPABILITIES[lang], key)
                for key in ("ui", "chat", "translation", "stt", "tts", "ocr", "retrieval")
            },
        }
        for lang in SUPPORTED
    ]
