"""
OmniParser sidecar — Spike 2 (real YOLO detection + optional captions).

Falls back to mock marks when weights are missing (IIVO_OMNIPARSER_MODE=auto).
"""

from __future__ import annotations

import base64
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from mock_marks import ParsedMark
from model_assets import detection_ready
from parser import OmniParserEngine

engine = OmniParserEngine()
_load_lock = threading.Lock()
_load_started = False


class ParseRequest(BaseModel):
    imageBase64: str
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    maxMarks: int = Field(default=24, ge=1, le=48)
    minConfidence: float = Field(default=0.15, ge=0.0, le=1.0)


class Bounds(BaseModel):
    x: float
    y: float
    w: float
    h: float


class Mark(BaseModel):
    id: str
    label: str
    bounds: Bounds
    confidence: float


class ParseResponse(BaseModel):
    marks: list[Mark]
    latencyMs: int
    modelVersion: str


def _to_api_mark(mark: ParsedMark) -> Mark:
    return Mark(
        id=mark.id,
        label=mark.label,
        bounds=Bounds(x=mark.x, y=mark.y, w=mark.w, h=mark.h),
        confidence=mark.confidence,
    )


def _decode_request_image(raw_b64: str) -> bytes:
    raw = raw_b64.strip()
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    return base64.b64decode(raw, validate=True)


def _real_required() -> bool:
    return os.environ.get("IIVO_OMNIPARSER_MODE", "auto").lower() == "real"


def _start_background_load() -> None:
    global _load_started
    with _load_lock:
        if _load_started:
            return
        _load_started = True

    def _run() -> None:
        try:
            engine.load()
        except Exception as exc:
            print(f"[omniparser-sidecar] model load failed: {exc}")

    threading.Thread(target=_run, daemon=True, name="omniparser-load").start()


def _wait_for_model(timeout_s: float = 45.0) -> bool:
    deadline = time.perf_counter() + timeout_s
    while time.perf_counter() < deadline:
        if engine.is_ready:
            return True
        time.sleep(0.1)
    return engine.is_ready


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _start_background_load()
    yield


app = FastAPI(
    title="IIVO OmniParser Sidecar",
    version="0.2.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, Any]:
    status = engine.status
    weights_present = detection_ready()
    loading = weights_present and not engine.is_ready and _load_started
    ready = engine.is_ready or not _real_required()
    return {
        "ready": ready,
        "modelLoaded": status.model_loaded,
        "modelVersion": status.model_version,
        "mode": status.mode,
        "device": status.device,
        "captionEnabled": status.caption_enabled,
        "weightsPresent": weights_present,
        "loading": loading,
    }


@app.post("/v1/parse", response_model=ParseResponse)
def parse_image(body: ParseRequest) -> ParseResponse:
    started = time.perf_counter()
    status = engine.status

    if _real_required() and not status.model_loaded:
        if not _wait_for_model():
            raise HTTPException(status_code=503, detail="model not loaded — run ./install-models.sh")

    if not body.imageBase64.strip():
        raise HTTPException(status_code=400, detail="imageBase64 required")

    try:
        image_bytes = _decode_request_image(body.imageBase64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid image: {exc}") from exc

    # Ensure model is warm before inference (first request may wait for background load).
    if not engine.is_ready:
        _wait_for_model(timeout_s=30.0)

    marks = engine.parse_jpeg(
        image_bytes,
        max_marks=body.maxMarks,
        min_confidence=body.minConfidence,
    )
    latency_ms = max(1, int((time.perf_counter() - started) * 1000))
    final_status = engine.status

    return ParseResponse(
        marks=[_to_api_mark(m) for m in marks],
        latencyMs=latency_ms,
        modelVersion=final_status.model_version,
    )
