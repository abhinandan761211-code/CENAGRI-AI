import argparse
import json
import os
import pickle
from typing import Any, Dict

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


REQUIRED_COLUMNS = [
    "Crop",
    "Crop_Year",
    "Season",
    "State",
    "Area",
    "Production",
    "Annual_Rainfall",
    "Fertilizer",
    "Pesticide",
    "Yield",
]

MODEL_FILENAME = "crop_yield_model.pkl"
METADATA_FILENAME = "crop_yield_metadata.json"


def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    for col in ["Crop", "Season", "State"]:
        cleaned[col] = cleaned[col].astype(str).str.strip()

    numeric_cols = [
        "Crop_Year",
        "Area",
        "Production",
        "Annual_Rainfall",
        "Fertilizer",
        "Pesticide",
        "Yield",
    ]
    for col in numeric_cols:
        cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")

    cleaned = cleaned.dropna(subset=REQUIRED_COLUMNS)
    return cleaned


def train_crop_yield_model(csv_path: str, model_dir: str) -> Dict[str, Any]:
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    os.makedirs(model_dir, exist_ok=True)

    raw_df = pd.read_csv(csv_path)
    missing = [c for c in REQUIRED_COLUMNS if c not in raw_df.columns]
    if missing:
        raise ValueError(f"Missing required columns in CSV: {missing}")

    df = _clean_dataframe(raw_df)
    if len(df) < 100:
        raise ValueError("Not enough clean rows to train a stable model.")

    feature_columns = [
        "Crop",
        "Season",
        "State",
        "Crop_Year",
        "Area",
        "Annual_Rainfall",
        "Fertilizer",
        "Pesticide",
    ]
    target_column = "Yield"

    X = df[feature_columns]
    y = df[target_column]

    categorical_features = ["Crop", "Season", "State"]
    numeric_features = [
        "Crop_Year",
        "Area",
        "Annual_Rainfall",
        "Fertilizer",
        "Pesticide",
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
            ("num", StandardScaler(), numeric_features),
        ]
    )

    model = RandomForestRegressor(
        n_estimators=350,
        max_depth=24,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
    )

    pipeline.fit(X_train, y_train)

    y_pred_train = pipeline.predict(X_train)
    y_pred_test = pipeline.predict(X_test)

    train_r2 = float(r2_score(y_train, y_pred_train))
    test_r2 = float(r2_score(y_test, y_pred_test))
    mae = float(mean_absolute_error(y_test, y_pred_test))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_test)))

    model_path = os.path.join(model_dir, MODEL_FILENAME)
    with open(model_path, "wb") as f:
        pickle.dump(pipeline, f)

    crop_state_df = (
        df.groupby(["Crop", "State"], as_index=False)["Yield"].mean().round(4)
    )
    crop_state_baseline = {
        f"{row['Crop']}|||{row['State']}": float(row["Yield"])
        for _, row in crop_state_df.iterrows()
    }

    crop_only_df = df.groupby("Crop", as_index=False)["Yield"].mean().round(4)
    crop_only_baseline = {
        str(row["Crop"]): float(row["Yield"])
        for _, row in crop_only_df.iterrows()
    }

    crop_reference_df = (
        df.groupby("Crop", as_index=False)[["Annual_Rainfall", "Fertilizer", "Pesticide"]]
        .median()
        .round(4)
    )
    crop_input_reference = {
        str(row["Crop"]): {
            "annual_rainfall": float(row["Annual_Rainfall"]),
            "fertilizer": float(row["Fertilizer"]),
            "pesticide": float(row["Pesticide"]),
        }
        for _, row in crop_reference_df.iterrows()
    }

    metadata = {
        "model_type": "RandomForestRegressor",
        "trained_on_csv": csv_path,
        "records_used": int(len(df)),
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "metrics": {
            "train_r2": train_r2,
            "test_r2": test_r2,
            "mae": mae,
            "rmse": rmse,
        },
        "features": feature_columns,
        "target": target_column,
        "supported": {
            "crops": sorted(df["Crop"].unique().tolist()),
            "seasons": sorted(df["Season"].unique().tolist()),
            "states": sorted(df["State"].unique().tolist()),
        },
        "yield_baselines": {
            "crop_state": crop_state_baseline,
            "crop": crop_only_baseline,
        },
        "crop_input_reference": crop_input_reference,
    }

    metadata_path = os.path.join(model_dir, METADATA_FILENAME)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return {
        "model_path": model_path,
        "metadata_path": metadata_path,
        "metrics": metadata["metrics"],
        "records_used": metadata["records_used"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train crop yield model from CSV")
    parser.add_argument(
        "--csv",
        default="/Users/abhinandankumar/Downloads/crop_yield.csv",
        help="Path to crop yield CSV",
    )
    parser.add_argument(
        "--model-dir",
        default=os.path.dirname(__file__),
        help="Directory to save model artifacts",
    )
    args = parser.parse_args()

    result = train_crop_yield_model(args.csv, args.model_dir)
    print("Crop yield model trained successfully")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
