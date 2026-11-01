"""Crop advisory endpoint — model-backed when LLM_API_KEY is set, rule-based
otherwise. See ``app.services.advisory`` for the fallback behaviour.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import advisory as advisory_service

router = APIRouter()


class AdvisoryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=600)
    crop: str | None = Field(default=None, max_length=80)
    district: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    weather: str | None = Field(default=None, max_length=120)
    language: str = Field(default="English", max_length=40)


@router.post("")
async def ask(payload: AdvisoryRequest) -> dict:
    """Answer one crop question, with the farm context the farmer already has."""
    try:
        return await advisory_service.advise(
            question=payload.question,
            crop=payload.crop,
            district=payload.district,
            state=payload.state,
            weather=payload.weather,
            language=payload.language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/status")
def status() -> dict:
    """Whether a model is configured — lets the UI label demo vs. real advice."""
    return {
        "configured": advisory_service.is_configured(),
        "model": advisory_service.settings.LLM_MODEL if advisory_service.is_configured() else None,
    }


@router.get("/topics")
def topics() -> dict:
    """Suggested prompts for the empty state (static, no model call)."""
    return {
        "topics": [
            "My paddy leaves are turning yellow between the veins. What should I do?",
            "When should I irrigate my mustard after sowing?",
            "How do I split urea doses for better yield?",
            "Best time to sell onions at the mandi?",
            "Brown spots with a grey centre on paddy leaves — is this blast?",
        ]
    }
