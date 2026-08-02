import json
import os
import pickle
from datetime import datetime
from typing import Any, Dict, Optional

import pandas as pd

from app.ml_models.train_yield_model import (
    METADATA_FILENAME,
    MODEL_FILENAME,
    train_crop_yield_model,
)
from app.services.sarvam_service import get_sarvam_service


MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml_models"))


class CropYieldService:
    def __init__(self) -> None:
        self.model = None
        self.metadata: Dict[str, Any] = {}
        self.load_artifacts()

    def load_artifacts(self) -> bool:
        model_path = os.path.join(MODEL_DIR, MODEL_FILENAME)
        metadata_path = os.path.join(MODEL_DIR, METADATA_FILENAME)

        if not (os.path.exists(model_path) and os.path.exists(metadata_path)):
            self.model = None
            self.metadata = {}
            return False

        try:
            with open(model_path, "rb") as f:
                self.model = pickle.load(f)
            with open(metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)
            return True
        except Exception:
            self.model = None
            self.metadata = {}
            return False

    def train_model(self, csv_path: str) -> Dict[str, Any]:
        result = train_crop_yield_model(csv_path=csv_path, model_dir=MODEL_DIR)
        self.load_artifacts()
        return result

    def _supported(self) -> Dict[str, Any]:
        return self.metadata.get("supported", {})

    def _validate_value(self, label: str, value: str, allowed: list) -> None:
        if value not in allowed:
            raise ValueError(
                f"Unsupported {label}: {value}. Available sample values: {allowed[:12]}"
            )

    def predict_yield(
        self,
        *,
        crop: str,
        crop_year: int,
        season: str,
        state: str,
        area: float,
        annual_rainfall: float,
        fertilizer: float,
        pesticide: float,
    ) -> Dict[str, Any]:
        if self.model is None:
            raise ValueError(
                "Crop yield model not loaded. Train first with /crop-yield/train endpoint."
            )

        crop_clean = crop.strip()
        season_clean = season.strip()
        state_clean = state.strip()

        supported = self._supported()
        self._validate_value("crop", crop_clean, supported.get("crops", []))
        self._validate_value("season", season_clean, supported.get("seasons", []))
        self._validate_value("state", state_clean, supported.get("states", []))

        row = pd.DataFrame(
            [
                {
                    "Crop": crop_clean,
                    "Crop_Year": int(crop_year),
                    "Season": season_clean,
                    "State": state_clean,
                    "Area": float(area),
                    "Annual_Rainfall": float(annual_rainfall),
                    "Fertilizer": float(fertilizer),
                    "Pesticide": float(pesticide),
                }
            ]
        )

        predicted_yield = float(self.model.predict(row)[0])
        predicted_production = max(0.0, predicted_yield * float(area))

        crop_state_key = f"{crop_clean}|||{state_clean}"
        baselines = self.metadata.get("yield_baselines", {})
        baseline = (
            baselines.get("crop_state", {}).get(crop_state_key)
            or baselines.get("crop", {}).get(crop_clean)
            or 0.0
        )
        baseline = float(baseline)

        if baseline > 0:
            performance_index = round((predicted_yield / baseline) * 100, 2)
        else:
            performance_index = 100.0

        if performance_index >= 110:
            rating = "high"
        elif performance_index >= 95:
            rating = "average"
        else:
            rating = "low"

        return {
            "crop": crop_clean,
            "crop_year": int(crop_year),
            "season": season_clean,
            "state": state_clean,
            "inputs": {
                "area": float(area),
                "annual_rainfall": float(annual_rainfall),
                "fertilizer": float(fertilizer),
                "pesticide": float(pesticide),
            },
            "predicted_yield": round(predicted_yield, 4),
            "estimated_production": round(predicted_production, 2),
            "baseline_yield": round(baseline, 4),
            "performance_index": performance_index,
            "performance_rating": rating,
            "trained_model_r2": self.metadata.get("metrics", {}).get("test_r2"),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    def build_agentic_advice(
        self,
        prediction: Dict[str, Any],
        goal: str = "maximize_yield",
        language: str = "en",
    ) -> Dict[str, Any]:
        crop = prediction["crop"]
        perf = float(prediction["performance_index"])
        inputs = prediction["inputs"]

        reference = self.metadata.get("crop_input_reference", {}).get(crop, {})
        recommended_rain = float(reference.get("annual_rainfall", inputs["annual_rainfall"]))
        recommended_fertilizer = float(reference.get("fertilizer", inputs["fertilizer"]))
        recommended_pesticide = float(reference.get("pesticide", inputs["pesticide"]))

        strategy_steps = []
        if inputs["annual_rainfall"] < (0.9 * recommended_rain):
            strategy_steps.append("Add moisture management: mulching and scheduled irrigation.")
        if inputs["fertilizer"] < (0.9 * recommended_fertilizer):
            strategy_steps.append("Increase nutrient plan gradually based on soil test windows.")
        if inputs["pesticide"] > (1.2 * recommended_pesticide):
            strategy_steps.append("Reduce pesticide intensity and switch to integrated pest management.")
        if not strategy_steps:
            strategy_steps.append("Maintain current agronomy pattern and focus on timing optimization.")

        strategy_steps.append("Monitor crop health weekly and recalibrate field inputs every 14 days.")

        service = get_sarvam_service()
        system_prompt = (
            "You are an expert agronomist and planning assistant. "
            "Return concise and practical field actions."
        )
        user_prompt = (
            f"Language: {language}\n"
            f"Goal: {goal}\n"
            f"Prediction summary: {json.dumps(prediction)}\n"
            f"Rule-based draft actions: {strategy_steps}\n"
            "Create a short execution plan with:\n"
            "1) 7-day actions\n2) 30-day actions\n3) risk control\n"
            "Use plain bullet points and include measurable targets."
        )

        ai_result = service.generate_text(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.25,
            max_tokens=360,
        )

        if ai_result.get("ok"):
            ai_plan = ai_result.get("text", "")
            source = ai_result.get("source", "sarvam")
        else:
            if language == "hi":
                ai_plan = (
                    "- अगले 7 दिन: नमी और पोषण की साप्ताहिक जांच करें।\n"
                    "- अगले 30 दिन: इनपुट को चरणबद्ध तरीके से baseline के करीब लाएं।\n"
                    "- जोखिम नियंत्रण: कीट और रोग के लिए IPM आधारित मॉनिटरिंग रखें।"
                )
            else:
                ai_plan = (
                    "- Next 7 days: monitor moisture and nutrition weekly.\n"
                    "- Next 30 days: tune field inputs toward the crop baseline in phases.\n"
                    "- Risk control: keep IPM-based pest and disease monitoring active."
                )
            source = "rules_fallback"

        confidence = 0.8 if perf >= 95 else 0.66

        return {
            "goal": goal,
            "orchestration_trace": [
                {
                    "agent": "data_agent",
                    "status": "completed",
                    "detail": "Validated supported crop/season/state and numeric agronomy inputs.",
                },
                {
                    "agent": "model_agent",
                    "status": "completed",
                    "detail": "Generated crop yield and production forecast from trained model.",
                },
                {
                    "agent": "strategy_agent",
                    "status": "completed",
                    "detail": "Prepared rule-based interventions from learned crop baselines.",
                },
                {
                    "agent": "ai_agent",
                    "status": "completed",
                    "detail": f"Generated final execution plan using {source}.",
                },
            ],
            "rule_based_actions": strategy_steps,
            "ai_execution_plan": ai_plan,
            "plan_confidence": confidence,
            "source": source,
        }

    def health(self) -> Dict[str, Any]:
        return {
            "model_loaded": self.model is not None,
            "trained_records": self.metadata.get("records_used", 0),
            "model_type": self.metadata.get("model_type", "not_trained"),
            "metrics": self.metadata.get("metrics", {}),
        }

    def supported_values(self) -> Dict[str, Any]:
        supported = self._supported()
        return {
            "crops": supported.get("crops", []),
            "seasons": supported.get("seasons", []),
            "states": supported.get("states", []),
            "total_crops": len(supported.get("crops", [])),
            "total_seasons": len(supported.get("seasons", [])),
            "total_states": len(supported.get("states", [])),
        }


_service: Optional[CropYieldService] = None


def get_crop_yield_service() -> CropYieldService:
    global _service
    if _service is None:
        _service = CropYieldService()
    return _service
