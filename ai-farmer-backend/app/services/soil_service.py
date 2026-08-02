import os
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

DEFAULT_SOIL_CSV_PATH = "/Users/abhinandankumar/Downloads/soil.csv"


class SoilService:
    def __init__(self, csv_path: str = DEFAULT_SOIL_CSV_PATH) -> None:
        self.csv_path = csv_path
        self._df: Optional[pd.DataFrame] = None

    def _load_df(self) -> pd.DataFrame:
        if self._df is not None:
            return self._df

        if not os.path.exists(self.csv_path):
            raise FileNotFoundError(f"Soil dataset not found at: {self.csv_path}")

        df = pd.read_csv(self.csv_path)
        df.columns = [str(c).strip() for c in df.columns]

        if "District" not in df.columns:
            # Fallback for odd spacing in source header
            district_col = [c for c in df.columns if c.lower().startswith("district")]
            if district_col:
                df = df.rename(columns={district_col[0]: "District"})

        numeric_cols = ["Zn %", "Fe%", "Cu %", "Mn %", "B %", "S %"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        if "District" in df.columns:
            df["District"] = df["District"].astype(str).str.strip()

        self._df = df
        return df

    def health(self) -> Dict[str, Any]:
        exists = os.path.exists(self.csv_path)
        out: Dict[str, Any] = {
            "dataset_path": self.csv_path,
            "dataset_exists": exists,
        }
        if not exists:
            return out

        df = self._load_df()
        out.update(
            {
                "rows": int(len(df)),
                "columns": list(df.columns),
                "district_count": int(df["District"].nunique()) if "District" in df.columns else 0,
            }
        )
        return out

    def get_districts(self) -> List[str]:
        df = self._load_df()
        if "District" not in df.columns:
            return []
        return sorted([d for d in df["District"].dropna().unique().tolist() if d])

    def get_micronutrient_profile(self, district: Optional[str] = None) -> Dict[str, Any]:
        df = self._load_df()
        cols = ["Zn %", "Fe%", "Cu %", "Mn %", "B %", "S %"]
        available_cols = [c for c in cols if c in df.columns]

        if not available_cols:
            return {
                "scope": "unavailable",
                "micronutrients": {},
                "deficiencies": [],
            }

        selected_df = df
        scope = "statewide_average"
        if district and "District" in df.columns:
            matched = df[df["District"].str.lower() == district.strip().lower()]
            if not matched.empty:
                selected_df = matched
                scope = "district"

        mic_df = selected_df.loc[:, available_cols]
        means_series = mic_df.mean(axis=0, numeric_only=True)
        means = {col: float(means_series.get(col, 0.0)) for col in available_cols}

        micronutrients: Dict[str, Dict[str, Any]] = {}
        deficiencies: List[str] = []

        for k, v in means.items():
            val = round(float(v), 2) if pd.notna(v) else 0.0
            status = "good" if val >= 70 else "moderate" if val >= 55 else "low"
            micronutrients[k] = {
                "value_percent": val,
                "status": status,
            }
            if status == "low":
                deficiencies.append(k)

        return {
            "scope": scope,
            "district": district,
            "micronutrients": micronutrients,
            "deficiencies": deficiencies,
        }


def _range_score(value: float, low: float, high: float) -> float:
    if low <= value <= high:
        return 1.0
    if value < low:
        gap = low - value
    else:
        gap = value - high
    return max(0.0, 1.0 - (gap / max(1.0, (high - low))))


def _label_for_status(score: float) -> str:
    if score >= 0.82:
        return "excellent"
    if score >= 0.65:
        return "good"
    if score >= 0.45:
        return "moderate"
    return "low"


def _categorical_score(value: Optional[str], allowed: List[str]) -> float:
    if not value:
        return 0.65
    return 1.0 if str(value).strip().lower() in {item.lower() for item in allowed} else 0.45


def recommend_crops(
    nitrogen: float,
    phosphorus: float,
    potassium: float,
    ph: float,
    soil_moisture: Optional[float] = None,
    organic_carbon: Optional[float] = None,
    ec: Optional[float] = None,
    temperature_c: Optional[float] = None,
    rainfall_mm: Optional[float] = None,
    soil_type: Optional[str] = None,
    season: Optional[str] = None,
    irrigation: Optional[str] = None,
    zinc_percent: Optional[float] = None,
    iron_percent: Optional[float] = None,
    copper_percent: Optional[float] = None,
    manganese_percent: Optional[float] = None,
    boron_percent: Optional[float] = None,
    sulfur_percent: Optional[float] = None,
) -> List[Dict[str, Any]]:
    # Approximate agronomic ranges for quick recommendation.
    crop_ranges: Dict[str, Dict[str, Tuple[float, float]]] = {
        "rice": {"N": (80, 140), "P": (35, 60), "K": (40, 80), "pH": (5.5, 7.0)},
        "wheat": {"N": (90, 150), "P": (40, 70), "K": (35, 70), "pH": (6.0, 7.5)},
        "maize": {"N": (100, 180), "P": (45, 75), "K": (45, 85), "pH": (5.8, 7.2)},
        "cotton": {"N": (80, 130), "P": (35, 65), "K": (50, 90), "pH": (5.8, 8.0)},
        "sugarcane": {"N": (120, 200), "P": (50, 90), "K": (70, 140), "pH": (6.0, 8.0)},
        "pulses": {"N": (35, 75), "P": (30, 60), "K": (30, 70), "pH": (6.0, 7.8)},
        "soybean": {"N": (45, 90), "P": (35, 65), "K": (35, 75), "pH": (6.0, 7.5)},
        "groundnut": {"N": (40, 85), "P": (35, 70), "K": (35, 70), "pH": (6.0, 7.2)},
        "tomato": {"N": (90, 160), "P": (45, 75), "K": (80, 150), "pH": (6.0, 7.0)},
        "potato": {"N": (100, 170), "P": (45, 80), "K": (80, 150), "pH": (5.2, 6.8)},
    }

    crop_context: Dict[str, Dict[str, Any]] = {
        "rice": {
            "moisture": (55, 90),
            "oc": (0.6, 1.8),
            "ec": (0.0, 2.5),
            "temp": (22, 35),
            "rain": (120, 320),
            "soil_type": ["clay", "clay loam", "silty clay", "alluvial"],
            "season": ["kharif"],
            "irrigation": ["canal", "flood", "drip", "sprinkler"],
        },
        "wheat": {
            "moisture": (35, 65),
            "oc": (0.5, 1.5),
            "ec": (0.0, 2.0),
            "temp": (15, 28),
            "rain": (40, 140),
            "soil_type": ["loam", "clay loam", "sandy loam", "alluvial"],
            "season": ["rabi"],
            "irrigation": ["canal", "drip", "sprinkler"],
        },
        "maize": {
            "moisture": (40, 75),
            "oc": (0.5, 1.8),
            "ec": (0.0, 2.2),
            "temp": (18, 34),
            "rain": (60, 220),
            "soil_type": ["loam", "sandy loam", "clay loam"],
            "season": ["kharif", "zaid"],
            "irrigation": ["drip", "sprinkler", "canal"],
        },
        "cotton": {
            "moisture": (35, 65),
            "oc": (0.5, 1.6),
            "ec": (0.0, 3.0),
            "temp": (20, 36),
            "rain": (50, 180),
            "soil_type": ["black", "clay loam", "loam"],
            "season": ["kharif"],
            "irrigation": ["drip", "furrow", "canal"],
        },
        "sugarcane": {
            "moisture": (50, 85),
            "oc": (0.7, 2.2),
            "ec": (0.0, 2.8),
            "temp": (22, 38),
            "rain": (100, 280),
            "soil_type": ["loam", "clay loam", "alluvial", "black"],
            "season": ["kharif", "rabi"],
            "irrigation": ["drip", "canal", "flood"],
        },
        "pulses": {
            "moisture": (25, 55),
            "oc": (0.4, 1.3),
            "ec": (0.0, 2.0),
            "temp": (18, 32),
            "rain": (35, 130),
            "soil_type": ["loam", "sandy loam", "alluvial", "red"],
            "season": ["rabi", "zaid", "kharif"],
            "irrigation": ["rainfed", "drip", "sprinkler"],
        },
        "soybean": {
            "moisture": (35, 65),
            "oc": (0.6, 1.8),
            "ec": (0.0, 2.2),
            "temp": (20, 33),
            "rain": (70, 220),
            "soil_type": ["clay loam", "loam", "black"],
            "season": ["kharif"],
            "irrigation": ["rainfed", "sprinkler", "drip"],
        },
        "groundnut": {
            "moisture": (30, 60),
            "oc": (0.5, 1.6),
            "ec": (0.0, 2.0),
            "temp": (20, 34),
            "rain": (50, 180),
            "soil_type": ["sandy loam", "loamy sand", "red"],
            "season": ["kharif", "rabi"],
            "irrigation": ["rainfed", "drip", "sprinkler"],
        },
        "tomato": {
            "moisture": (45, 75),
            "oc": (0.7, 2.0),
            "ec": (0.0, 2.5),
            "temp": (18, 32),
            "rain": (35, 160),
            "soil_type": ["loam", "sandy loam", "clay loam"],
            "season": ["rabi", "zaid"],
            "irrigation": ["drip", "furrow", "sprinkler"],
        },
        "potato": {
            "moisture": (50, 80),
            "oc": (0.8, 2.2),
            "ec": (0.0, 2.2),
            "temp": (14, 27),
            "rain": (30, 120),
            "soil_type": ["sandy loam", "loam", "alluvial"],
            "season": ["rabi"],
            "irrigation": ["sprinkler", "drip", "furrow"],
        },
    }

    results: List[Dict[str, Any]] = []
    for crop, ranges in crop_ranges.items():
        context = crop_context.get(crop, {})
        n_score = _range_score(nitrogen, *ranges["N"])
        p_score = _range_score(phosphorus, *ranges["P"])
        k_score = _range_score(potassium, *ranges["K"])
        ph_score = _range_score(ph, *ranges["pH"])

        moisture_score = _range_score(soil_moisture, *context["moisture"]) if soil_moisture is not None and context.get("moisture") else 0.65
        oc_score = _range_score(organic_carbon, *context["oc"]) if organic_carbon is not None and context.get("oc") else 0.65
        ec_score = _range_score(ec, *context["ec"]) if ec is not None and context.get("ec") else 0.65
        temp_score = _range_score(temperature_c, *context["temp"]) if temperature_c is not None and context.get("temp") else 0.65
        rain_score = _range_score(rainfall_mm, *context["rain"]) if rainfall_mm is not None and context.get("rain") else 0.65
        soil_type_score = _categorical_score(soil_type, context.get("soil_type", []))
        season_score = _categorical_score(season, context.get("season", []))
        irrigation_score = _categorical_score(irrigation, context.get("irrigation", []))
        zinc_score = _range_score(zinc_percent, 55, 100) if zinc_percent is not None else 0.65
        iron_score = _range_score(iron_percent, 60, 100) if iron_percent is not None else 0.65
        copper_score = _range_score(copper_percent, 60, 100) if copper_percent is not None else 0.65
        manganese_score = _range_score(manganese_percent, 60, 100) if manganese_percent is not None else 0.65
        boron_score = _range_score(boron_percent, 50, 100) if boron_percent is not None else 0.65
        sulfur_score = _range_score(sulfur_percent, 55, 100) if sulfur_percent is not None else 0.65

        context_score = (
            (moisture_score * 0.18)
            + (oc_score * 0.14)
            + (ec_score * 0.1)
            + (temp_score * 0.16)
            + (rain_score * 0.16)
            + (soil_type_score * 0.1)
            + (season_score * 0.08)
            + (irrigation_score * 0.08)
        )

        micronutrient_score = (
            (zinc_score * 0.18)
            + (iron_score * 0.18)
            + (copper_score * 0.16)
            + (manganese_score * 0.16)
            + (boron_score * 0.16)
            + (sulfur_score * 0.16)
        )

        base_score = (n_score * 0.3) + (p_score * 0.25) + (k_score * 0.25) + (ph_score * 0.2)
        final_score = (base_score * 0.72) + (context_score * 0.2) + (micronutrient_score * 0.08)
        results.append(
            {
                "crop": crop,
                "suitability_score": round(final_score * 100, 2),
                "fit": _label_for_status(final_score),
                "component_scores": {
                    "nitrogen": round(n_score * 100, 2),
                    "phosphorus": round(p_score * 100, 2),
                    "potassium": round(k_score * 100, 2),
                    "ph": round(ph_score * 100, 2),
                    "soil_moisture": round(moisture_score * 100, 2),
                    "organic_carbon": round(oc_score * 100, 2),
                    "ec": round(ec_score * 100, 2),
                    "temperature_c": round(temp_score * 100, 2),
                    "rainfall_mm": round(rain_score * 100, 2),
                    "soil_type": round(soil_type_score * 100, 2),
                    "season": round(season_score * 100, 2),
                    "irrigation": round(irrigation_score * 100, 2),
                    "zinc_percent": round(zinc_score * 100, 2),
                    "iron_percent": round(iron_score * 100, 2),
                    "copper_percent": round(copper_score * 100, 2),
                    "manganese_percent": round(manganese_score * 100, 2),
                    "boron_percent": round(boron_score * 100, 2),
                    "sulfur_percent": round(sulfur_score * 100, 2),
                },
            }
        )

    results.sort(key=lambda x: x["suitability_score"], reverse=True)
    return results


def npk_status(n: float, p: float, k: float, ph: float) -> Dict[str, str]:
    def nutrient_flag(value: float, low: float, high: float) -> str:
        if value < low:
            return "low"
        if value > high:
            return "high"
        return "optimal"

    def ph_flag(value: float) -> str:
        if value < 5.8:
            return "acidic"
        if value > 7.8:
            return "alkaline"
        return "balanced"

    return {
        "nitrogen": nutrient_flag(n, 60, 140),
        "phosphorus": nutrient_flag(p, 30, 70),
        "potassium": nutrient_flag(k, 35, 90),
        "ph": ph_flag(ph),
    }


def nutrient_recommendations(
    status: Dict[str, str],
    micronutrients: Optional[Dict[str, Optional[float]]] = None,
) -> List[str]:
    recs: List[str] = []

    if status.get("nitrogen") == "low":
        recs.append("Nitrogen low: apply urea/compost in split doses.")
    elif status.get("nitrogen") == "high":
        recs.append("Nitrogen high: reduce urea and increase irrigation monitoring.")

    if status.get("phosphorus") == "low":
        recs.append("Phosphorus low: apply SSP/DAP and use phosphate-solubilizing biofertilizer.")
    elif status.get("phosphorus") == "high":
        recs.append("Phosphorus high: avoid extra DAP and rebalance with organic matter.")

    if status.get("potassium") == "low":
        recs.append("Potassium low: apply MOP/SOP and return crop residue where possible.")
    elif status.get("potassium") == "high":
        recs.append("Potassium high: avoid excess potash and monitor nutrient lockout.")

    if status.get("ph") == "acidic":
        recs.append("Soil pH acidic: apply lime/dolomite and retest after 30-45 days.")
    elif status.get("ph") == "alkaline":
        recs.append("Soil pH alkaline: use gypsum, organic compost, and sulfur-based amendments.")

    if micronutrients:
        micro_thresholds = {
            "Zn %": (55, "Zinc low: add ZnSO4 10-15 kg/ha in split schedule."),
            "Fe%": (60, "Iron low: use ferrous sulfate foliar spray and organic mulch."),
            "Cu %": (60, "Copper low: apply copper micronutrient mix at recommended dose."),
            "Mn %": (60, "Manganese low: apply manganese sulfate through foliar feed."),
            "B %": (50, "Boron low: apply borax in low dose and avoid over-application."),
            "S %": (55, "Sulfur low: use gypsum/ammonium sulfate to improve S availability."),
        }

        for key, value in micronutrients.items():
            threshold, msg = micro_thresholds.get(key, (None, None))
            if threshold is None or msg is None:
                continue
            if value is not None and value < threshold:
                recs.append(msg)

    if not recs:
        recs.append("NPK and pH look balanced. Continue crop rotation and periodic soil testing.")

    return recs
