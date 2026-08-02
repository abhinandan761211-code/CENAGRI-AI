from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from app.services.crop_yield_service import get_crop_yield_service


router = APIRouter()


class CropYieldTrainRequest(BaseModel):
    csv_path: str = Field(
        default="/Users/abhinandankumar/Downloads/crop_yield.csv",
        description="Absolute path to crop yield CSV",
    )


class CropYieldPredictRequest(BaseModel):
    crop: str
    crop_year: int = Field(ge=1960, le=2100)
    season: str
    state: str
    area: float = Field(gt=0)
    annual_rainfall: float = Field(gt=0)
    fertilizer: float = Field(ge=0)
    pesticide: float = Field(ge=0)


class CropYieldAgentRequest(CropYieldPredictRequest):
    goal: str = Field(default="maximize_yield")
    language: str = Field(default="en")


@router.get("/health")
def crop_yield_health():
    service = get_crop_yield_service()
    return {
        "status": "success",
        "data": service.health(),
    }


@router.get("/supported")
def crop_yield_supported():
    service = get_crop_yield_service()
    return {
        "status": "success",
        "data": service.supported_values(),
    }


@router.post("/train")
def train_crop_yield_model(payload: CropYieldTrainRequest):
    service = get_crop_yield_service()
    try:
        result = service.train_model(payload.csv_path)
        return {
            "status": "success",
            "message": "Crop yield model trained successfully.",
            "data": result,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/predict")
def predict_crop_yield(payload: CropYieldPredictRequest):
    service = get_crop_yield_service()
    try:
        result = service.predict_yield(
            crop=payload.crop,
            crop_year=payload.crop_year,
            season=payload.season,
            state=payload.state,
            area=payload.area,
            annual_rainfall=payload.annual_rainfall,
            fertilizer=payload.fertilizer,
            pesticide=payload.pesticide,
        )
        return {
            "status": "success",
            "data": result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


@router.post("/agent-plan")
def get_crop_yield_agent_plan(payload: CropYieldAgentRequest):
    service = get_crop_yield_service()
    try:
        prediction = service.predict_yield(
            crop=payload.crop,
            crop_year=payload.crop_year,
            season=payload.season,
            state=payload.state,
            area=payload.area,
            annual_rainfall=payload.annual_rainfall,
            fertilizer=payload.fertilizer,
            pesticide=payload.pesticide,
        )
        plan = service.build_agentic_advice(
            prediction=prediction,
            goal=payload.goal,
            language=payload.language,
        )
        return {
            "status": "success",
            "data": {
                "prediction": prediction,
                "agentic_plan": plan,
            },
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent plan generation failed: {exc}")
