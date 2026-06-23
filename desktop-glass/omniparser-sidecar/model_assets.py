"""OmniParser v2 weight paths and HuggingFace download helpers."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ID = "microsoft/OmniParser-v2.0"
MODEL_VERSION = "omniparser-v2.0"

DETECTION_FILES = (
    "icon_detect/model.pt",
    "icon_detect/model.yaml",
    "icon_detect/train_args.yaml",
)

CAPTION_FILES = (
    "icon_caption/config.json",
    "icon_caption/generation_config.json",
    "icon_caption/model.safetensors",
)


def models_dir() -> Path:
    env = os.environ.get("IIVO_OMNIPARSER_MODELS_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return Path(__file__).resolve().parent / "models"


def detection_weights_path() -> Path | None:
    candidate = models_dir() / "icon_detect" / "model.pt"
    return candidate if candidate.is_file() else None


def caption_weights_dir() -> Path | None:
    # OmniParser repo expects icon_caption_florence/
    candidate = models_dir() / "icon_caption_florence"
    if (candidate / "config.json").is_file() and (candidate / "model.safetensors").is_file():
        return candidate
    return None


def detection_ready() -> bool:
    return detection_weights_path() is not None


def caption_ready() -> bool:
    return caption_weights_dir() is not None


def download_detection_weights(force: bool = False) -> Path:
    from huggingface_hub import hf_hub_download

    root = models_dir()
    root.mkdir(parents=True, exist_ok=True)
    for rel in DETECTION_FILES:
        dest = root / rel
        if dest.is_file() and not force:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        hf_hub_download(
            repo_id=REPO_ID,
            filename=rel,
            local_dir=str(root),
        )
    path = detection_weights_path()
    if path is None:
        raise RuntimeError("Detection weights missing after download")
    return path


def download_caption_weights(force: bool = False) -> Path:
    from huggingface_hub import hf_hub_download
    import shutil

    root = models_dir()
    root.mkdir(parents=True, exist_ok=True)
    caption_root = root / "icon_caption_florence"
    caption_root.mkdir(parents=True, exist_ok=True)

    for rel in CAPTION_FILES:
        filename = rel.split("/", 1)[1]
        dest = caption_root / filename
        if dest.is_file() and not force:
            continue
        hf_hub_download(
            repo_id=REPO_ID,
            filename=rel,
            local_dir=str(root),
        )
        # HuggingFace writes to models/icon_caption/ — mirror into icon_caption_florence/
        src = root / "icon_caption" / filename
        if src.is_file():
            shutil.copy2(src, dest)

    path = caption_weights_dir()
    if path is None:
        raise RuntimeError("Caption weights missing after download")
    return path
