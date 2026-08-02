from typing import List

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.sarvam_service import get_sarvam_service

router = APIRouter()


class TranslateBatchPayload(BaseModel):
    texts: List[str] = Field(default_factory=list)
    target_language: str = Field(default="hi")
    source_language: str = Field(default="auto")


@router.get("/health")
def ai_health():
    service = get_sarvam_service()
    return {
        "status": "success",
        "sarvam_available": service.available,
    }


@router.post("/query")
def query_ai_assistant(
    question: str = Query(..., description="User question"),
    module: str = Query("general", description="Module context"),
    context: str = Query("", description="Optional contextual details"),
    language: str = Query("en", description="Language code"),
):
    service = get_sarvam_service()
    system_prompt = (
        "You are an AI assistant for an agricultural marketplace web app. "
        "Give concise, practical, safe, farmer-friendly answers."
    )
    user_prompt = (
        f"Module: {module}\n"
        f"Language: {language}\n"
        f"Context: {context}\n"
        f"Question: {question}\n"
        "Respond in clear bullet points with direct action advice."
    )

    ai = service.generate_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.25,
        max_tokens=350,
    )

    fallback = (
        "I can help with mandi prices, crop planning, alerts, storage, transport, and quality checks. "
        "Please share crop, location, and your goal for a tailored answer."
        if language != "hi"
        else "मैं मंडी भाव, फसल योजना, अलर्ट, स्टोरेज, ट्रांसपोर्ट और क्वालिटी में मदद कर सकता हूं। "
             "बेहतर सलाह के लिए फसल, स्थान और लक्ष्य बताएं।"
    )

    return {
        "status": "success",
        "data": {
            "reply": ai.get("text") if ai.get("ok") else fallback,
            "source": ai.get("source", "rules_fallback"),
            "module": module,
            "language": language,
        },
    }


@router.post("/translate-batch")
def translate_batch(payload: TranslateBatchPayload):
    service = get_sarvam_service()

    texts = payload.texts or []
    if not texts:
        return {
            "status": "success",
            "data": {
                "translations": [],
                "source": "empty",
                "count": 0,
                "target_language": payload.target_language,
            },
        }

    result = service.translate_batch(
        texts=texts,
        target_language=payload.target_language,
        source_language=payload.source_language,
    )

    return {
        "status": "success",
        "data": result,
    }
