"""Multilingual AI endpoints.

Two jobs, kept apart on purpose:

* ``POST /ai/chat`` — forwards a question to the Multi Model AI Assistant, which
  does the language detection, agriculture retrieval and same-language answer.
  CenAGRI does not translate the question before sending it; local crop names
  and units would be lost.
* ``POST /ai/translate`` — on-demand translation of user-generated content
  (a CenFriend post, a product description). Opt-in only, cached, and always
  returned alongside the original so the UI can show both.

Account context sent to the model is built from the VERIFIED session and the
server's own profile row — never from the request body. A caller cannot claim to
be a different account type to get a different answer.
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.api.v1.farmer import CurrentUser, require_user
from app.core import languages
from app.core.config import settings
from app.services import ai_bridge, translate

log = logging.getLogger(__name__)
router = APIRouter()

LanguageTag = Literal["en", "hi", "or", "bn"]

#: Per-user budget for dynamic AI translation (cost control). Keyed by user id.
_TRANSLATE_WINDOW_SECONDS = 60
_TRANSLATE_MAX_PER_WINDOW = 20
_translate_hits: dict[str, list[float]] = {}


def _throttle(user_id: str) -> None:
    now = time.time()
    bucket = [t for t in _translate_hits.get(user_id, []) if now - t < _TRANSLATE_WINDOW_SECONDS]
    if len(bucket) >= _TRANSLATE_MAX_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many translations just now. Please wait a minute.",
        )
    bucket.append(now)
    _translate_hits[user_id] = bucket


# ── Schemas ───────────────────────────────────────────────────────────────


class ChatContext(BaseModel):
    """Farm context the answer may use. Free-form keys, bounded in size."""

    account_type: str | None = None
    crop: str | None = None
    state: str | None = None
    district: str | None = None
    extra: dict[str, str] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    #: What the client *thinks* the question is. Advisory only — the pipeline
    #: runs its own detection and that result wins.
    detected_language: LanguageTag | None = None
    #: The language the user asked to be answered in.
    response_language: LanguageTag | None = None
    conversation_id: str | None = Field(default=None, max_length=64)
    context: ChatContext = Field(default_factory=ChatContext)

    @field_validator("message")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a question first.")
        return value


class ChatResponse(BaseModel):
    request_id: str
    #: The answer, in ``response_language``.
    answer: str
    detected_language: LanguageTag
    response_language: LanguageTag
    #: False when the answer could not be produced in the requested language.
    language_honoured: bool
    conversation_id: str | None = None
    intent: str | None = None
    model: str | None = None
    sources: list[dict[str, Any]] = Field(default_factory=list)
    low_confidence: bool = False
    translation_used: bool = False


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    target: LanguageTag
    source: LanguageTag | None = None
    #: Where the text came from — used only for cache keys and usage stats.
    scope: Literal["post", "comment", "product", "video", "group", "market", "other"] = "other"


class TranslateResponse(BaseModel):
    request_id: str
    original: str
    translated: str
    source_language: LanguageTag
    target_language: LanguageTag
    #: False when no provider could translate it: the client must show the
    #: original and say so, never display the untranslated text as a translation.
    ok: bool
    cached: bool
    provider: str | None = None


class CapabilityRow(BaseModel):
    code: str
    name: str
    ui: bool
    chat: bool
    translation: bool
    stt: bool
    tts: bool
    ocr: bool
    retrieval: bool


# ── Helpers ───────────────────────────────────────────────────────────────


def _request_id() -> str:
    return uuid.uuid4().hex[:12]


async def _verified_role(user: CurrentUser) -> str | None:
    """Read the account type from the profile row for the verified session.

    The role in the request body is never trusted: a caller could otherwise ask
    for a buyer's answer while signed in as a worker. When the lookup is not
    possible (service key not configured, row missing) the role is left out
    rather than guessed.
    """
    if not settings.user_api_enabled:
        return None
    try:
        from app.db.admin_store import AdminStore

        store = AdminStore.from_settings()
        rows = await store.select(
            "profiles", columns="role", filters={"id": f"eq.{user.user_id}"}, limit=1
        )
        role = rows[0].get("role") if rows else None
        return str(role) if role else None
    except Exception as exc:  # noqa: BLE001 - context is best-effort, never fatal
        log.info("profile role lookup failed for %s: %s", user.user_id, exc)
        return None


def _context_for_model(role: str | None, ctx: ChatContext) -> dict[str, Any]:
    """Account context the model may rely on, built from verified data only."""
    data: dict[str, Any] = {}
    if role:
        data["account_type"] = role
    for key in ("crop", "state", "district"):
        value = getattr(ctx, key, None)
        if value:
            data[key] = value
    if ctx.extra:
        # Bounded: the model prompt must not be inflatable by a crafted body.
        for key, value in list(ctx.extra.items())[:10]:
            if isinstance(value, str) and len(value) <= 200:
                data[key] = value
    return data


# ── Routes ────────────────────────────────────────────────────────────────


@router.get("/languages", response_model=list[CapabilityRow], tags=["ai"])
def language_matrix() -> list[dict[str, Any]]:
    """Which capability is actually available per language.

    Built from ``app.core.languages`` — the same table the bridge uses, so the
    UI never offers a feature the backend cannot serve.
    """
    return languages.matrix()


@router.get("/health", tags=["ai"])
async def ai_health() -> dict[str, Any]:
    status_obj = await ai_bridge.health()
    return {
        "assistant": status_obj,
        "translation": {"configured": bool(translate.configured_provider())},
    }


@router.post("/chat", response_model=ChatResponse, tags=["ai"])
async def chat(payload: ChatRequest, user: Annotated[CurrentUser, Depends(require_user)]) -> ChatResponse:
    """Ask the multilingual assistant — the question is forwarded unchanged."""
    request_id = _request_id()
    role = await _verified_role(user)
    context = _context_for_model(role, payload.context)
    asked_language = languages.normalize(payload.response_language)

    conversation_id = payload.conversation_id
    try:
        if not conversation_id:
            conversation_id = await ai_bridge.create_conversation(language=asked_language)
        answer = await ai_bridge.ask_blocking(
            message=payload.message,
            conversation_id=conversation_id,
            response_language=asked_language,
            detected_language=payload.detected_language,
            context=context,
        )
    except ai_bridge.AssistantUnavailable as exc:
        log.info("chat unavailable request=%s: %s", request_id, exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ai_bridge.AssistantRejected as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # The requested language must be honoured; if the pipeline answered in a
    # different one, say so instead of pretending the answer is what was asked.
    honoured = answer.response_language == asked_language
    if not honoured:
        log.warning(
            "language mismatch request=%s asked=%s got=%s",
            request_id,
            asked_language,
            answer.response_language,
        )

    return ChatResponse(
        request_id=request_id,
        answer=answer.text,
        detected_language=answer.detected_language,  # type: ignore[arg-type]
        response_language=answer.response_language,  # type: ignore[arg-type]
        language_honoured=honoured,
        conversation_id=answer.conversation_id,
        intent=answer.intent,
        model=answer.model,
        sources=answer.sources,
        low_confidence=answer.low_confidence,
        translation_used=answer.translated,
    )


@router.post("/translate", response_model=TranslateResponse, tags=["ai"])
async def translate_text(
    payload: TranslateRequest, user: Annotated[CurrentUser, Depends(require_user)]
) -> TranslateResponse:
    """Translate user-generated content on request. Original is always returned."""
    request_id = _request_id()
    _throttle(getattr(user, "user_id", "anon"))
    source = languages.normalize(payload.source)
    target = languages.normalize(payload.target)

    if source == target:
        return TranslateResponse(
            request_id=request_id,
            original=payload.text,
            translated=payload.text,
            source_language=source,  # type: ignore[arg-type]
            target_language=target,  # type: ignore[arg-type]
            ok=True,
            cached=True,
        )

    result = await translate.translate(
        text=payload.text,
        source=source,
        target=target,
        scope=payload.scope,
        request_id=request_id,
    )
    return TranslateResponse(
        request_id=request_id,
        original=payload.text,
        translated=result.text,
        source_language=source,  # type: ignore[arg-type]
        target_language=target,  # type: ignore[arg-type]
        ok=result.ok,
        cached=result.cached,
        provider=result.provider,
    )
