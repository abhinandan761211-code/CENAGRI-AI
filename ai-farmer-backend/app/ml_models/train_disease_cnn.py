import argparse
import json
import os
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split


MODEL_DIR = os.path.dirname(__file__)
MODEL_FILENAME = "leaf_disease_cnn.keras"
LABEL_MAP_FILENAME = "leaf_disease_label_map.json"
MODEL_METADATA_FILENAME = "leaf_disease_model_metadata.json"


def _resolve_catalog_path(metadata_path: str, dataset_root: str) -> str:
    with open(metadata_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    candidates: List[str] = []
    for item in metadata.get("distribution", []):
        content_url = str(item.get("contentUrl", "")).strip()
        if content_url.endswith("dataset_catalog.csv"):
            candidates.append(content_url)

    if not candidates:
        raise ValueError("dataset_catalog.csv reference not found in metadata JSON")

    candidate = candidates[0]
    if os.path.isabs(candidate) and os.path.exists(candidate):
        return candidate

    local_candidate = os.path.join(dataset_root, os.path.basename(candidate))
    if os.path.exists(local_candidate):
        return local_candidate

    raise FileNotFoundError(
        f"dataset_catalog.csv not found. Expected at: {local_candidate}. "
        "Please extract the Kaggle dataset zip into dataset_root."
    )


def _resolve_image_path(dataset_root: str, image_path: str) -> str:
    path = image_path.strip().replace("\\", "/")
    if os.path.isabs(path) and os.path.exists(path):
        return path

    candidate = os.path.join(dataset_root, path)
    if os.path.exists(candidate):
        return candidate

    alt_candidate = os.path.join(dataset_root, os.path.basename(path))
    if os.path.exists(alt_candidate):
        return alt_candidate

    return candidate


def _build_dataset_rows(catalog_path: str, dataset_root: str) -> pd.DataFrame:
    df = pd.read_csv(catalog_path)
    required = {"filename", "label"}
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Catalog missing required columns: {missing}")

    df = df.copy()
    df["filename"] = df["filename"].astype(str)
    df["label"] = df["label"].astype(str).str.strip()
    if "disease" not in df.columns:
        df["disease"] = "unknown"
    if "crop" not in df.columns:
        df["crop"] = "unknown"

    df["image_path"] = df["filename"].apply(lambda p: _resolve_image_path(dataset_root, p))
    df = df[df["image_path"].apply(os.path.exists)].reset_index(drop=True)

    if len(df) < 50:
        raise ValueError(
            "Not enough labeled images found for training. "
            "Ensure dataset is extracted and filenames in dataset_catalog.csv are valid."
        )

    return df


def _decode_image(path: tf.Tensor, label: tf.Tensor, image_size: Tuple[int, int]):
    image_bytes = tf.io.read_file(path)
    image = tf.io.decode_image(image_bytes, channels=3, expand_animations=False)
    image = tf.image.resize(image, image_size)
    image = tf.cast(image, tf.float32) / 255.0
    return image, label


def _build_tf_dataset(paths: np.ndarray, labels: np.ndarray, image_size: Tuple[int, int], batch_size: int, training: bool):
    ds = tf.data.Dataset.from_tensor_slices((paths, labels))
    if training:
        ds = ds.shuffle(buffer_size=min(4096, len(paths)), reshuffle_each_iteration=True)
    ds = ds.map(lambda p, l: _decode_image(p, l, image_size), num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return ds


def train_leaf_disease_cnn(
    metadata_path: str,
    dataset_root: str,
    epochs: int = 3,
    batch_size: int = 32,
    image_size: Tuple[int, int] = (224, 224),
) -> Dict[str, Any]:
    catalog_path = _resolve_catalog_path(metadata_path, dataset_root)
    df = _build_dataset_rows(catalog_path, dataset_root)

    labels = sorted(df["label"].unique().tolist())
    label_to_index = {label: idx for idx, label in enumerate(labels)}
    index_to_label = {idx: label for label, idx in label_to_index.items()}

    df["label_idx"] = df["label"].map(label_to_index).astype(int)

    train_df, val_df = train_test_split(
        df,
        test_size=0.2,
        random_state=42,
        stratify=df["label_idx"],
    )

    train_ds = _build_tf_dataset(
        train_df["image_path"].values,
        train_df["label_idx"].values,
        image_size,
        batch_size,
        training=True,
    )
    val_ds = _build_tf_dataset(
        val_df["image_path"].values,
        val_df["label_idx"].values,
        image_size,
        batch_size,
        training=False,
    )

    tf.keras.backend.clear_session()

    data_augmentation = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.06),
            tf.keras.layers.RandomZoom(0.1),
        ]
    )

    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(image_size[0], image_size[1], 3),
        include_top=False,
        weights="imagenet",
    )
    base_model.trainable = False

    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(image_size[0], image_size[1], 3)),
            data_augmentation,
            base_model,
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dropout(0.35),
            tf.keras.layers.Dense(256, activation="relu"),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(len(labels), activation="softmax"),
        ]
    )

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=3,
            mode="max",
            restore_best_weights=True,
        )
    ]

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=max(1, int(epochs)),
        callbacks=callbacks,
        verbose=1,
    )

    _, val_accuracy = model.evaluate(val_ds, verbose=0)

    model_path = os.path.join(MODEL_DIR, MODEL_FILENAME)
    model.save(model_path)

    label_map_payload = {
        "label_to_index": label_to_index,
        "index_to_label": {str(k): v for k, v in index_to_label.items()},
        "label_metadata": {
            label: {
                "crop": str(df[df["label"] == label]["crop"].mode().iloc[0]) if not df[df["label"] == label].empty else "unknown",
                "disease": str(df[df["label"] == label]["disease"].mode().iloc[0]) if not df[df["label"] == label].empty else "unknown",
            }
            for label in labels
        },
    }

    with open(os.path.join(MODEL_DIR, LABEL_MAP_FILENAME), "w", encoding="utf-8") as f:
        json.dump(label_map_payload, f, indent=2)

    metadata = {
        "model_type": "MobileNetV2TransferLearning",
        "metadata_path": metadata_path,
        "dataset_root": dataset_root,
        "catalog_path": catalog_path,
        "num_classes": len(labels),
        "train_samples": int(len(train_df)),
        "val_samples": int(len(val_df)),
        "epochs_requested": int(epochs),
        "best_val_accuracy": float(max(history.history.get("val_accuracy", [0.0]))),
        "final_val_accuracy": float(val_accuracy),
        "labels": labels,
    }

    metadata_path_out = os.path.join(MODEL_DIR, MODEL_METADATA_FILENAME)
    with open(metadata_path_out, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return {
        "model_path": model_path,
        "label_map_path": os.path.join(MODEL_DIR, LABEL_MAP_FILENAME),
        "metadata_output_path": metadata_path_out,
        "num_classes": len(labels),
        "train_samples": int(len(train_df)),
        "val_samples": int(len(val_df)),
        "final_val_accuracy": float(val_accuracy),
        "best_val_accuracy": float(max(history.history.get("val_accuracy", [0.0]))),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train leaf disease CNN from metadata and dataset catalog")
    parser.add_argument(
        "--metadata",
        default="/Users/abhinandankumar/Downloads/indian-crops-leaf-disease-metadata (1).json",
        help="Path to metadata JSON",
    )
    parser.add_argument(
        "--dataset-root",
        default="/Users/abhinandankumar/Downloads/indian-crops-leaf-disease",
        help="Root directory containing dataset_catalog.csv and image files",
    )
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()

    result = train_leaf_disease_cnn(
        metadata_path=args.metadata,
        dataset_root=args.dataset_root,
        epochs=args.epochs,
        batch_size=args.batch_size,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
