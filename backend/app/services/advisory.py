"""AI crop advisory.

Calls any OpenAI-compatible chat-completions endpoint. With no ``LLM_API_KEY``
configured the service does NOT pretend to be an AI: it answers from a small
rule-based knowledge base and labels the result ``demo`` so the UI can say
plainly that no model was used.
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import settings

# Keep the prompt small: the model only needs the farm context and the question.
MAX_QUESTION_CHARS = 600
REQUEST_TIMEOUT = 45.0

SYSTEM_PROMPT = (
    "You are CenAGRI-AI, an agricultural advisor for small and marginal farmers "
    "in West Bengal, India. Answer in the farmer's language ({language}). "
    "Be concrete and practical: give at most 5 short numbered steps. Mention "
    "quantities and timings where you can. Never invent pesticide brand names, "
    "prices or weather readings. If the question needs a lab test, soil test or "
    "in-person diagnosis, say so plainly and say what to do instead. Keep the "
    "whole answer under 180 words."
)

# Deliberately conservative, general agronomy — not a diagnosis. Ordered by the
# first matching keyword group; `None` key is the default answer.
_RULES: list[tuple[tuple[str, ...], str]] = [
    (
        ("yellow", "hola", "পাতা হলুদ", "पीला"),
        "Yellowing is often a nutrient issue rather than disease.\n"
        "1. Check whether older leaves yellow first (usually nitrogen) or new "
        "leaves (iron/zinc).\n2. Waterlogged roots cause the same symptom — look at "
        "drainage first.\n3. Don't apply extra urea blindly; a soil test settles it.",
    ),
    (
        ("blight", "spot", "disease", "রোগ", "रोग", "insect", "pest", "worm", "borer"),
        "For leaf spots or pests, act in this order.\n"
        "1. Remove and destroy badly affected leaves away from the field.\n"
        "2. Photograph the affected leaf and show it to your block agriculture "
        "office — confirmed diagnosis beats guessing.\n"
        "3. Avoid spraying within 24 hours of expected rain.\n"
        "4. Keep the field from staying waterlogged; many diseases spread faster there.",
    ),
    (
        ("irrigat", "water", "সেচ", "सिंचाई", "drought"),
        "On irrigation.\n"
        "1. Water early morning or evening to cut evaporation.\n"
        "2. Paddy wants standing water; vegetables want moist soil, not flooded.\n"
        "3. Check the top 5 cm of soil before watering — if it crumbles, it's dry.",
    ),
    (
        ("fertil", "urea", "npk", "compost", "manure", "সার", "खाद"),
        "On fertiliser.\n"
        "1. Test your soil once a season; pH outside 6.0–7.0 locks up nutrients.\n"
        "2. Split nitrogen into 2–3 doses rather than one heavy application.\n"
        "3. Add organic matter every year — it holds both water and nutrients.",
    ),
    (
        ("price", "sell", "market", "mandi", "দাম", "बाजार"),
        "On selling.\n"
        "1. Check today's prices on the Mandi Prices card before leaving for market.\n"
        "2. Grade your produce — graded lots commonly fetch 10–15% more.\n"
        "3. Compare the nearest mandi with the next one out; freight can wipe out "
        "a small price difference.",
    ),
]

DEMO_NOTICE = (
    "This is rule-based guidance, not AI analysis: no LLM key is configured on "
    "the server. Add LLM_API_KEY to enable model-backed advice."
)


def _pick_rule(question: str) -> tuple[str, str]:
    """Return (topic, answer) for the first matching rule, else the default."""
    text = question.lower()
    for keywords, answer in _RULES:
        if any(word in text for word in keywords):
            return keywords[0], answer
    return (
        "general",
        "Here is general guidance.\n"
        "1. Describe what you see: crop, stage, and which part of the plant is affected.\n"
        "2. Note when it started and what changed around then (rain, fertiliser, spray).\n"
        "3. For a confident diagnosis, share a close photo with your block agriculture "
        "office.\n"
        "4. Keep notes between seasons — patterns repeat.",
    )


def is_configured() -> bool:
    return bool(settings.LLM_API_KEY.strip())


async def _call_llm(
    *, question: str, crop: str | None, district: str | None, state: str | None,
    weather: str | None, language: str,
) -> str:
    context = []
    if crop:
        context.append(f"Crop: {crop}")
    if district or state:
        context.append(f"Location: {', '.join(p for p in (district, state) if p)}")
    if weather:
        context.append(f"Current weather: {weather}")
    user = (("\n".join(context) + "\n\n") if context else "") + f"Question: {question}"

    payload = {
        "model": settings.LLM_MODEL.strip() or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT.format(language=language)},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 400,
    }

    url = settings.LLM_BASE_URL.rstrip("/") + "/chat/completions"
    async with httpx.AsyncClient(timeout=httpx.Timeout(REQUEST_TIMEOUT)) as client:
        res = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.LLM_API_KEY.strip()}"},
        )
    if res.status_code != 200:
        raise RuntimeError(f"LLM provider returned HTTP {res.status_code}")
    body = res.json()
    text = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if not text.strip():
        raise RuntimeError("LLM provider returned an empty answer")
    return text.strip()


def _numbered(text: str) -> list[str]:
    """Split a model/rule answer into steps or paragraphs for the UI."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    steps: list[str] = []
    for line in lines:
        cleaned = re.sub(r"^\s*(?:\d+[.)]|[-*•])\s*", "", line)
        if cleaned:
            steps.append(cleaned)
    return steps


async def advise(
    *,
    question: str,
    crop: str | None = None,
    district: str | None = None,
    state: str | None = None,
    weather: str | None = None,
    language: str = "English",
) -> dict[str, Any]:
    """Answer a crop question. Falls back to rules — clearly labelled — on error."""
    question = (question or "").strip()
    if not question:
        raise ValueError("Ask a question first.")
    if len(question) > MAX_QUESTION_CHARS:
        question = question[:MAX_QUESTION_CHARS]

    if is_configured():
        try:
            answer = await _call_llm(
                question=question,
                crop=crop,
                district=district,
                state=state,
                weather=weather,
                language=language,
            )
            return {
                "mode": "ai",
                "model": settings.LLM_MODEL.strip() or "gpt-4o-mini",
                "answer": answer,
                "steps": _numbered(answer),
                "notice": None,
            }
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError) as exc:
            # Never fail the farmer's request because the provider is down; say
            # what happened and give the rule-based answer instead.
            topic, answer = _pick_rule(question)
            return {
                "mode": "demo",
                "model": None,
                "topic": topic,
                "answer": answer,
                "steps": _numbered(answer),
                "notice": f"The AI provider could not be reached ({exc}). {DEMO_NOTICE}",
            }

    topic, answer = _pick_rule(question)
    return {
        "mode": "demo",
        "model": None,
        "topic": topic,
        "answer": answer,
        "steps": _numbered(answer),
        "notice": DEMO_NOTICE,
    }
