"""Contract tests for the multilingual AI layer.

These run without any provider key: they pin the behaviour that must hold when
things are NOT configured, which is where a wrong-language answer would
otherwise leak through.

    cd backend && .venv/bin/python -m pytest tests/test_multilingual_ai.py -q
"""
from __future__ import annotations

import asyncio

import pytest

from app.core import languages as L
from app.services import translate


def run(coro):
    """Run a coroutine without needing pytest-asyncio installed."""
    return asyncio.run(coro)


# ── Language mapping layer ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("hi", "hi"),
        ("HI", "hi"),
        ("hi-IN", "hi"),
        ("od-IN", "or"),      # provider spelling of Odia
        ("or-IN", "or"),
        ("bn_IN", "bn"),
        ("en", "en"),
    ],
)
def test_normalize_accepts_provider_tags(raw: str, expected: str) -> None:
    assert L.normalize(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "fr", "de-DE", "klingon"])
def test_normalize_falls_back_for_unknown(raw: str | None) -> None:
    assert L.normalize(raw) == "en"


def test_provider_codes_are_confined_to_the_mapping() -> None:
    assert L.to_provider("or", "sarvam") == "od-IN"
    assert L.to_provider("or", "azure") == "or-IN"
    assert L.to_provider("or", "internal") == "or"
    # Every supported language must map for every known provider.
    for provider in ("sarvam", "azure", "google", "bhashini", "internal"):
        for lang in L.SUPPORTED:
            assert L.to_provider(lang, provider)


def test_capability_matrix_is_conservative() -> None:
    # Voice is not claimed just because chat works.
    for lang in L.SUPPORTED:
        assert L.supports(lang, "chat")
        assert not L.supports(lang, "tts")
        assert not L.supports(lang, "stt")


def test_matrix_has_one_row_per_language() -> None:
    rows = L.matrix()
    assert {row["code"] for row in rows} == set(L.SUPPORTED)


# ── Translation must never silently return the wrong language ─────────────


def test_unconfigured_provider_reports_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(translate.settings, "TRANSLATE_PROVIDER", "")
    result = run(translate.translate(text="धान की पत्ती पीली है", source="hi", target="or"))
    assert result.ok is False
    assert result.text == "धान की पत्ती पीली है"  # original, not a fake translation


def test_provider_without_key_is_not_used(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(translate.settings, "TRANSLATE_PROVIDER", "sarvam")
    monkeypatch.setattr(translate.settings, "TRANSLATE_API_KEY", "")
    assert translate.configured_provider() is None


def test_provider_failure_is_soft(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(translate.settings, "TRANSLATE_PROVIDER", "sarvam")
    monkeypatch.setattr(translate.settings, "TRANSLATE_API_KEY", "test-key")

    async def boom(*_args, **_kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setitem(translate._PROVIDERS, "sarvam", boom)
    result = run(translate.translate(text="धान की पत्ती पीली है", source="hi", target="or"))
    assert result.ok is False
    assert result.text == "धान की पत्ती पीली है"


def test_successful_translation_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(translate.settings, "TRANSLATE_PROVIDER", "sarvam")
    monkeypatch.setattr(translate.settings, "TRANSLATE_API_KEY", "test-key")
    calls = {"n": 0}

    async def fake(text, source, target):
        calls["n"] += 1
        return "ଧାନ ପତ୍ର ହଳଦିଆ"

    monkeypatch.setitem(translate._PROVIDERS, "sarvam", fake)
    first = run(translate.translate(text="धान की पत्ती पीली है", source="hi", target="or", scope="post"))
    second = run(translate.translate(text="धान की पत्ती पीली है", source="hi", target="or", scope="post"))
    assert first.ok and second.ok
    assert second.cached is True
    assert calls["n"] == 1  # provider charged once, not per request


# ── Bridge error policy ───────────────────────────────────────────────────


def test_bridge_is_typed_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import ai_bridge

    monkeypatch.setattr(ai_bridge.settings, "AI_ASSISTANT_URL", "")
    async def call():
        return await ai_bridge.ask(
            message="ମୋ ଧାନ ଗଛର ପତ୍ର ହଳଦିଆ ହେଉଛି",
            conversation_id=None,
            response_language="or",
            detected_language=None,
            context={},
        )

    with pytest.raises(ai_bridge.AssistantUnavailable):
        run(call())
