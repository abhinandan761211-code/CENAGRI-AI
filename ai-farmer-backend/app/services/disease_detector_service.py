import io
import json
import os
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image


LABEL_MAP_FILENAME = "leaf_disease_label_map.json"
MODEL_FILENAME = "leaf_disease_cnn.keras"
MODEL_METADATA_FILENAME = "leaf_disease_metadata.json"


MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml_models"))


class DiseaseDetectorService:
    def __init__(self) -> None:
        self.model: Optional[Any] = None
        self.label_map: Dict[str, Any] = {}
        self.metadata: Dict[str, Any] = {}
        self.load_artifacts()

    def load_artifacts(self) -> bool:
        model_path = os.path.join(MODEL_DIR, MODEL_FILENAME)
        label_map_path = os.path.join(MODEL_DIR, LABEL_MAP_FILENAME)
        metadata_path = os.path.join(MODEL_DIR, MODEL_METADATA_FILENAME)

        if not (os.path.exists(model_path) and os.path.exists(label_map_path) and os.path.exists(metadata_path)):
            self.model = None
            self.label_map = {}
            self.metadata = {}
            return False

        try:
            import tensorflow as tf

            self.model = tf.keras.models.load_model(model_path)
            with open(label_map_path, "r", encoding="utf-8") as f:
                self.label_map = json.load(f)
            with open(metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)
            return True
        except Exception:
            self.model = None
            self.label_map = {}
            self.metadata = {}
            return False

    @property
    def available(self) -> bool:
        return self.model is not None

    def train_model(self, metadata_path: str, dataset_root: str, epochs: int = 3, batch_size: int = 32) -> Dict[str, Any]:
        from app.ml_models.train_disease_cnn import train_leaf_disease_cnn

        result = train_leaf_disease_cnn(
            metadata_path=metadata_path,
            dataset_root=dataset_root,
            epochs=epochs,
            batch_size=batch_size,
        )
        self.load_artifacts()
        return result

    def _preprocess(self, image_bytes: bytes) -> np.ndarray:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image = image.resize((224, 224))
        arr = np.array(image).astype(np.float32) / 255.0
        return np.expand_dims(arr, axis=0)

    def _treatment_suggestions(self, disease_name: str, crop_name: str) -> List[str]:
        d = (disease_name or "").lower()
        c = crop_name or "crop"

        if "blight" in d:
            return [
                f"Remove infected {c} leaves and destroy them away from field.",
                "Spray copper-based fungicide or mancozeb as per local dose guidelines.",
                "Avoid overhead irrigation in evening to reduce leaf wetness.",
            ]
        if "rust" in d:
            return [
                "Use resistant variety where possible and maintain wider row spacing.",
                "Apply triazole/strobilurin fungicide based on extension advisories.",
                "Monitor lower canopy weekly for new pustules.",
            ]
        if "mildew" in d or "fung" in d:
            return [
                "Improve air circulation and avoid water stagnation in crop canopy.",
                "Use sulfur or systemic fungicide as recommended for the crop.",
                "Irrigate in morning so foliage dries quickly.",
            ]
        if "bacterial" in d or "spot" in d:
            return [
                "Use clean tools/seeds and avoid working in wet fields.",
                "Apply copper bactericide where approved.",
                "Rogue severely infected plants to limit spread.",
            ]
        if "virus" in d or "mosaic" in d:
            return [
                "Control vector insects (whitefly/aphids) using IPM.",
                "Remove infected plants early and use healthy planting material.",
                "Use reflective mulches and yellow sticky traps.",
            ]
        if "healthy" in d:
            return [
                f"{c} leaves appear healthy. Continue regular scouting every 5-7 days.",
                "Maintain balanced nutrition and preventive IPM schedule.",
                "Avoid over-irrigation and keep field sanitation strong.",
            ]

        return [
            "Isolate the affected area and monitor disease progression for 2-3 days.",
            "Consult local agri expert for crop-specific fungicide/insecticide dose.",
            "Use integrated pest management with field sanitation and resistant varieties.",
        ]

    def predict(self, image_bytes: bytes) -> Dict[str, Any]:
        if not self.model:
            raise ValueError("Disease CNN model not loaded. Train model first.")

        x = self._preprocess(image_bytes)
        probs = self.model.predict(x, verbose=0)[0]
        class_idx = int(np.argmax(probs))
        confidence = float(probs[class_idx])

        index_to_label = self.label_map.get("index_to_label", {})
        label = str(index_to_label.get(str(class_idx), f"class_{class_idx}"))

        label_meta = self.label_map.get("label_metadata", {}).get(label, {})
        crop = str(label_meta.get("crop") or "unknown")
        disease = str(label_meta.get("disease") or label)

        return {
            "label": label,
            "crop": crop,
            "disease": disease,
            "confidence_pct": round(confidence * 100, 2),
            "treatment_suggestions": self._treatment_suggestions(disease, crop),
        }

    def model_health(self) -> Dict[str, Any]:
        return {
            "model_loaded": self.model is not None,
            "num_classes": int(self.metadata.get("num_classes", 0)),
            "train_samples": int(self.metadata.get("train_samples", 0)),
            "val_samples": int(self.metadata.get("val_samples", 0)),
            "best_val_accuracy": float(self.metadata.get("best_val_accuracy", 0.0)),
            "final_val_accuracy": float(self.metadata.get("final_val_accuracy", 0.0)),
            "labels": self.metadata.get("labels", []),
        }


_service: Optional[DiseaseDetectorService] = None


def get_disease_detector_service() -> DiseaseDetectorService:
    global _service
    if _service is None:
        _service = DiseaseDetectorService()
    return _service
