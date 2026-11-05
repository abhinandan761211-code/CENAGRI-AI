"""Bridge from CenAGRI to the Multi Model AI Assistant service.

The assistant already implements the multilingual pipeline — language
detection, intent, agriculture retrieval, generation and response-language
pinning. This module does NOT re-implement any of it; it forwards a verified
question and normalises the answer.

Why a bridge at all:

* The assistant owns its own conversation store, so it must create and continue
  the conversation itself. CenAGRI only holds a per-user pointer to it.
* The assistant's pipeline is synchronous and CPU/IO-bound, so it is run on a
  worker thread from the async route.
* Provider tags never cross this boundary — both sides speak ``en``/``hi``/
  ``or``/``bn`` (see ``app.core.languages``).

Failure policy: when the assistant is unreachable the caller gets a typed
error, never an answer written in the wrong language and never an invented
agriculture fact.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import settings
from app.core.languages import normalize

log = logging.getLogger(__name__)

#: Hard ceiling for one answer. The pipeline runs several model calls.
DEFAULT_TIMEOUT = 45.0


class AssistantUnavailable(RuntimeError):
    """The assistant service could not be reached or returned garbage."""


class AssistantRejected(RuntimeError):
    """The assistant answered, but with an error status we must not hide."""


@dataclass
class AssistantAnswer:
    """A normalised assistant reply — the only shape the API layer sees."""

    text: str
    detected_language: str
    response_language: str
    conversation_id: str | None = None
    intent: str | None = None
    model: str | None = None
    sources: list[dict[str, Any]] = field(default_factory=list)
    low_confidence: bool = False
    #: True when the answer had to be translated to reach the user's language.
    translated: bool = False


def _enabled() -> bool:
    return bool(getattr(settings, "AI_ASSISTANT_URL", "").rstrip("/"))


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """POST to the assistant with the service key. Raises typed errors only."""
    base = (getattr(settings, "AI_ASSISTANT_URL", "") or "").rstrip("/")
    if not base:
        raise AssistantUnavailable("The AI assistant service is not configured on this server.")

    headers = {"Content-Type": "application/json"}
    key = getattr(settings, "AI_ASSISTANT_KEY", "")
    if key:
        headers["X-Service-Key"] = key

    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException as exc:
        raise AssistantUnavailable("The AI assistant did not answer in time. Please try again.") from exc
    except httpx.HTTPError as exc:
        log.warning("assistant request failed: %s", exc)
        raise AssistantUnavailable("The AI assistant is not reachable right now.") from exc

    if response.status_code >= 500:
        log.warning("assistant 5xx on %s: %s", path, response.text[:300])
        raise AssistantUnavailable("The AI assistant is temporarily unavailable.")
    if response.status_code >= 400:
        # 401/403 here is a server-side key problem, not the user's fault.
        log.warning("assistant rejected %s: %s %s", path, response.status_code, response.text[:300])
        raise AssistantRejected("The AI assistant rejected this request.")

    try:
        return response.json()
    except ValueError as exc:
        raise AssistantUnavailable("The AI assistant returned an unreadable answer.") from exc


async def create_conversation(*, title: str | None = None, language: str = "en") -> str | None:
    """Start a conversation in the assistant, tagged with the user's language."""
    if not _enabled():
        raise AssistantUnavailable("The AI assistant service is not configured on this server.")
    try:
        data = await _post(
            "/api/conversations",
            {"title": title or "CenAGRI question", "channel": "cenagri", "language": normalize(language)},
        )
    except AssistantRejected:
        # An older assistant build may not accept `language`; retry minimally.
        data = await _post("/api/conversations", {"title": title or "CenAGRI question"})
    conversation_id = data.get("conversation_id") or data.get("id")
    return str(conversation_id) if conversation_id else None


async def ask(
    *,
    message: str,
    conversation_id: str | None,
    response_language: str | None,
    detected_language: str | None,
    context: dict[str, Any] | None = None,
) -> AssistantAnswer:
    """Send one turn to the assistant and normalise the reply.

    ``message`` is forwarded EXACTLY as the user typed it. The original text is
    never translated before it reaches the pipeline — the pipeline does its own
    detection and works on the original, otherwise local crop names and units
    get lost on the way in.
    """
    if not message.strip():
        raise AssistantRejected("Enter a question first.")

    payload: dict[str, Any] = {
        "message": message,
        "channel": "cenagri",
        # Explicit pins; the pipeline treats these as requests, not facts.
        "detected_language": normalize(detected_language) if detected_language else None,
        "response_language": normalize(response_language) if response_language else None,
        "context": context or {},
    }
    if conversation_id:
        payload["conversation_id"] = conversation_id
    # Drop the nulls so the assistant's own defaults (auto-detect) apply.
    payload = {k: v for k, v in payload.items() if v is not None}

    data = await _post("/api/chat", payload)

    text = (data.get("answer") or data.get("response") or data.get("message") or "").strip()
    if not text:
        raise AssistantUnavailable("The AI assistant returned an empty answer.")

    raw_sources = data.get("sources") or data.get("citations") or []
    sources: list[dict[str, Any]] = []
    for item in raw_sources:
        if isinstance(item, str):
            sources.append({"title": item})
        elif isinstance(item, dict):
            sources.append(item)

    return AssistantAnswer(
        text=text,
        detected_language=normalize(data.get("detected_language") or data.get("language")),
        response_language=normalize(data.get("response_language") or response_language or data.get("language")),
        conversation_id=str(data.get("conversation_id") or conversation_id or "") or None,
        intent=data.get("intent"),
        model=data.get("model"),
        sources=sources,
        low_confidence=bool(data.get("low_confidence") or data.get("needs_human")),
        translated=bool(data.get("translated")),
    )


async def ask_blocking(**kwargs: Any) -> AssistantAnswer:
    """Run :func:`ask` without blocking the event loop.

    The assistant pipeline is heavy and partly synchronous; running it on a
    worker thread keeps other requests (dashboards, mandi prices) responsive.
    """
    return await asyncio.to_thread(_ask_sync, kwargs)


def _ask_sync(kwargs: dict[str, Any]) -> AssistantAnswer:
    """Sync wrapper used from a worker thread. Owns its own event loop."""
    return asyncio.run(ask(**kwargs))


async def health() -> dict[str, Any]:
    """Small status object for the /ai/health endpoint."""
    base = (getattr(settings, "AI_ASSISTANT_URL", "") or "").rstrip("/")
    if not base:
        return {"configured": False, "reachable": False}
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(f"{base}/health")
        return {"configured": True, "reachable": response.status_code < 500, "status": response.status_code}
    except httpx.HTTPError:
        return {"configured": True, "reachable": False}
