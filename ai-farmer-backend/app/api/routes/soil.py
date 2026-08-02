import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.soil_service import (
    SoilService,
    npk_status,
    nutrient_recommendations,
    recommend_crops,
)
from app.services.sarvam_service import SarvamAIService


router = APIRouter()


def _extract_json_blob(text: str) -> Optional[Dict[str, Any]]:
    raw = (text or "").strip()
    if not raw:
        return None

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        parsed = json.loads(raw[start : end + 1])
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def _build_soil_ai_summary(
    *,
    payload: "SoilAnalysisRequest",
    status: Dict[str, str],
    best_crop: Optional[Dict[str, Any]],
    alternatives: List[Dict[str, Any]],
    rule_recommendations: List[str],
    language: str,
) -> Dict[str, Any]:
    service = SarvamAIService()

    if not service.available:
        return {
            "summary": "AI summary unavailable. Using rule-based recommendations.",
            "recommendations": rule_recommendations,
            "source": "rules_fallback",
        }

    alt_crops = ", ".join(
        [f"{item.get('crop')}({item.get('suitability_score')}%)" for item in (alternatives or [])[:3]]
    )

    prompt = (
        "Create farmer-friendly soil analysis output in strict JSON only.\n"
        "Required keys:\n"
        "1) summary: concise 2-3 line advisory summary\n"
        "2) recommendations: array of 4-6 practical actions\n"
        f"Language: {language or 'en'}\n"
        "Context:\n"
        f"N={payload.nitrogen}, P={payload.phosphorus}, K={payload.potassium}, pH={payload.ph}\n"
        f"Nutrient status={status}\n"
        f"District={payload.district}\n"
        f"Soil type={payload.soil_type}, season={payload.season}, irrigation={payload.irrigation}\n"
        f"Moisture={payload.soil_moisture}, OC={payload.organic_carbon}, EC={payload.ec}, Temp={payload.temperature_c}, Rain={payload.rainfall_mm}\n"
        f"Micronutrients: Zn={payload.zinc_percent}, Fe={payload.iron_percent}, Cu={payload.copper_percent}, Mn={payload.manganese_percent}, B={payload.boron_percent}, S={payload.sulfur_percent}\n"
        f"Best crop={best_crop.get('crop') if best_crop else ''} ({best_crop.get('suitability_score') if best_crop else ''}%)\n"
        f"Alternative crops={alt_crops}\n"
        f"Fallback recommendations={rule_recommendations}\n"
    )

    ai = service.generate_text(
        system_prompt="You are an agronomy assistant. Return strict JSON only.",
        user_prompt=prompt,
        temperature=0.2,
        max_tokens=420,
    )

    if not ai.get("ok"):
        return {
            "summary": "AI generation failed. Using rule-based recommendations.",
            "recommendations": rule_recommendations,
            "source": "rules_fallback",
        }

    parsed = _extract_json_blob(ai.get("text", ""))
    if not parsed:
        text = (ai.get("text") or "").strip()
        if not text:
            return {
                "summary": "AI output empty. Using rule-based recommendations.",
                "recommendations": rule_recommendations,
                "source": "rules_fallback",
            }
        return {
            "summary": text,
            "recommendations": rule_recommendations,
            "source": ai.get("source", "sarvam"),
        }

    recs = parsed.get("recommendations") or []
    if not isinstance(recs, list):
        recs = [str(recs)]
    recs = [str(item).strip() for item in recs if str(item).strip()][:6]

    return {
        "summary": str(parsed.get("summary", "")).strip() or "AI summary generated.",
        "recommendations": recs or rule_recommendations,
        "source": ai.get("source", "sarvam"),
    }


class SoilAnalysisRequest(BaseModel):
    nitrogen: float = Field(..., ge=0, le=300, description="Nitrogen value")
    phosphorus: float = Field(..., ge=0, le=300, description="Phosphorus value")
    potassium: float = Field(..., ge=0, le=300, description="Potassium value")
    ph: float = Field(..., ge=3.0, le=10.0, description="Soil pH value")
    district: Optional[str] = Field(default=None, description="District name for micronutrient context")
    soil_moisture: Optional[float] = Field(default=None, ge=0, le=100, description="Soil moisture percent")
    organic_carbon: Optional[float] = Field(default=None, ge=0, le=4, description="Organic carbon percent")
    ec: Optional[float] = Field(default=None, ge=0, le=6, description="Electrical conductivity (dS/m)")
    temperature_c: Optional[float] = Field(default=None, ge=0, le=55, description="Average field temperature in C")
    rainfall_mm: Optional[float] = Field(default=None, ge=0, le=1000, description="Recent rainfall in mm")
    soil_type: Optional[str] = Field(default=None, description="Soil type (loam, clay loam, etc.)")
    season: Optional[str] = Field(default=None, description="Season (kharif/rabi/zaid)")
    irrigation: Optional[str] = Field(default=None, description="Irrigation method")
    zinc_percent: Optional[float] = Field(default=None, ge=0, le=100, description="Zinc percentage")
    iron_percent: Optional[float] = Field(default=None, ge=0, le=100, description="Iron percentage")
    copper_percent: Optional[float] = Field(default=None, ge=0, le=100, description="Copper percentage")
    manganese_percent: Optional[float] = Field(default=None, ge=0, le=100, description="Manganese percentage")
    boron_percent: Optional[float] = Field(default=None, ge=0, le=100, description="Boron percentage")
    sulfur_percent: Optional[float] = Field(default=None, ge=0, le=100, description="Sulfur percentage")
    language: str = Field(default="en", description="Response language")


@router.get("/health")
def soil_health(
    csv_path: str = Query(
        "/Users/abhinandankumar/Downloads/soil.csv",
        description="Path to soil CSV file",
    )
) -> Dict[str, Any]:
    service = SoilService(csv_path=csv_path)
    try:
        return {
            "success": True,
            "data": service.health(),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Soil health check failed: {str(exc)}")


@router.get("/districts")
def soil_districts(
    csv_path: str = Query(
        "/Users/abhinandankumar/Downloads/soil.csv",
        description="Path to soil CSV file",
    )
) -> Dict[str, Any]:
    service = SoilService(csv_path=csv_path)
    try:
        return {
            "success": True,
            "districts": service.get_districts(),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to fetch districts: {str(exc)}")


@router.get("/micronutrients")
def soil_micronutrients(
    district: Optional[str] = Query(default=None, description="District name for micronutrient profile"),
    csv_path: str = Query(
        "/Users/abhinandankumar/Downloads/soil.csv",
        description="Path to soil CSV file",
    ),
) -> Dict[str, Any]:
    service = SoilService(csv_path=csv_path)
    try:
        return {
            "success": True,
            "data": service.get_micronutrient_profile(district),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to fetch micronutrients: {str(exc)}")


@router.post("/analyze")
def analyze_soil(
    payload: SoilAnalysisRequest,
    csv_path: str = Query(
        "/Users/abhinandankumar/Downloads/soil.csv",
        description="Path to soil CSV file",
    )
) -> Dict[str, Any]:
    service = SoilService(csv_path=csv_path)

    try:
        status = npk_status(
            n=payload.nitrogen,
            p=payload.phosphorus,
            k=payload.potassium,
            ph=payload.ph,
        )
        crop_scores = recommend_crops(
            nitrogen=payload.nitrogen,
            phosphorus=payload.phosphorus,
            potassium=payload.potassium,
            ph=payload.ph,
            soil_moisture=payload.soil_moisture,
            organic_carbon=payload.organic_carbon,
            ec=payload.ec,
            temperature_c=payload.temperature_c,
            rainfall_mm=payload.rainfall_mm,
            soil_type=payload.soil_type,
            season=payload.season,
            irrigation=payload.irrigation,
            zinc_percent=payload.zinc_percent,
            iron_percent=payload.iron_percent,
            copper_percent=payload.copper_percent,
            manganese_percent=payload.manganese_percent,
            boron_percent=payload.boron_percent,
            sulfur_percent=payload.sulfur_percent,
        )
        micronutrient_profile = service.get_micronutrient_profile(payload.district)
        fallback_recommendations = nutrient_recommendations(
            status,
            {
                "Zn %": payload.zinc_percent,
                "Fe%": payload.iron_percent,
                "Cu %": payload.copper_percent,
                "Mn %": payload.manganese_percent,
                "B %": payload.boron_percent,
                "S %": payload.sulfur_percent,
            },
        )
        ai_advice = _build_soil_ai_summary(
            payload=payload,
            status=status,
            best_crop=crop_scores[0] if crop_scores else None,
            alternatives=crop_scores[1:4],
            rule_recommendations=fallback_recommendations,
            language=payload.language,
        )

        return {
            "success": True,
            "input": {
                "nitrogen": payload.nitrogen,
                "phosphorus": payload.phosphorus,
                "potassium": payload.potassium,
                "ph": payload.ph,
                "district": payload.district,
                "soil_moisture": payload.soil_moisture,
                "organic_carbon": payload.organic_carbon,
                "ec": payload.ec,
                "temperature_c": payload.temperature_c,
                "rainfall_mm": payload.rainfall_mm,
                "soil_type": payload.soil_type,
                "season": payload.season,
                "irrigation": payload.irrigation,
                "zinc_percent": payload.zinc_percent,
                "iron_percent": payload.iron_percent,
                "copper_percent": payload.copper_percent,
                "manganese_percent": payload.manganese_percent,
                "boron_percent": payload.boron_percent,
                "sulfur_percent": payload.sulfur_percent,
            },
            "nutrient_status": status,
            "recommendations": ai_advice.get("recommendations", fallback_recommendations),
            "ai_summary": ai_advice.get("summary", ""),
            "recommendation_source": ai_advice.get("source", "rules_fallback"),
            "best_crop": crop_scores[0] if crop_scores else None,
            "alternative_crops": crop_scores[1:4],
            "all_crop_scores": crop_scores,
            "micronutrient_context": micronutrient_profile,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Soil analysis failed: {str(exc)}")
