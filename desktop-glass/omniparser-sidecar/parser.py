"""
OmniParser v2 inference for the Glass sidecar (Spike 2).

Uses Microsoft's icon detection YOLO weights (PyTorch via ultralytics).
Optional Florence-2 captions when weights are present and captioning is enabled.
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass
from typing import Literal

from PIL import Image

from mock_marks import ParsedMark, mock_marks
from model_assets import (
    MODEL_VERSION,
    caption_ready,
    caption_weights_dir,
    detection_weights_path,
)

ParserMode = Literal["mock", "yolo", "yolo+caption"]
MOCK_MODEL_VERSION = "omniparser-mock-v1"


@dataclass(frozen=True)
class EngineStatus:
    mode: ParserMode
    model_version: str
    model_loaded: bool
    device: str
    caption_enabled: bool


def xyxy_pixels_to_normalized(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    image_width: int,
    image_height: int,
) -> tuple[float, float, float, float] | None:
    if image_width <= 0 or image_height <= 0:
        return None
    w = x2 - x1
    h = y2 - y1
    if w <= 1 or h <= 1:
        return None
    x = max(0.0, min(1.0, x1 / image_width))
    y = max(0.0, min(1.0, y1 / image_height))
    nw = max(0.0, min(1.0, w / image_width))
    nh = max(0.0, min(1.0, h / image_height))
    if nw <= 0 or nh <= 0:
        return None
    return (round(x, 4), round(y, 4), round(nw, 4), round(nh, 4))


def sort_reading_order(marks: list[ParsedMark]) -> list[ParsedMark]:
    return sorted(marks, key=lambda m: (m.y, m.x))


def decode_image_bytes(raw: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(raw))
    return image.convert("RGB")


def _caption_requested() -> bool:
    return os.environ.get("IIVO_OMNIPARSER_CAPTION", "0") == "1"


def _pick_device() -> str:
    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


class OmniParserEngine:
    def __init__(self) -> None:
        self._yolo = None
        self._caption_model = None
        self._caption_processor = None
        self._device = "cpu"
        self._mode: ParserMode = "mock"
        self._model_version = MOCK_MODEL_VERSION
        self._caption_enabled = False
        self._ready = False

    @property
    def is_ready(self) -> bool:
        return self._ready

    @property
    def status(self) -> EngineStatus:
        return EngineStatus(
            mode=self._mode,
            model_version=self._model_version,
            model_loaded=self._mode != "mock",
            device=self._device,
            caption_enabled=self._caption_enabled,
        )

    def load(self) -> None:
        try:
            requested = os.environ.get("IIVO_OMNIPARSER_MODE", "auto").lower()
            if requested == "mock":
                self._mode = "mock"
                self._model_version = MOCK_MODEL_VERSION
                return

            weights = detection_weights_path()
            if weights is None:
                self._mode = "mock"
                self._model_version = MOCK_MODEL_VERSION
                return

            try:
                from ultralytics import YOLO

                self._device = _pick_device()
                self._yolo = YOLO(str(weights))
                self._mode = "yolo"
                self._model_version = MODEL_VERSION

                if _caption_requested() and caption_ready():
                    self._load_caption_model()
                    if self._caption_model is not None:
                        self._mode = "yolo+caption"
                        self._caption_enabled = True
            except Exception as exc:
                print(f"[omniparser] YOLO load failed, using mock: {exc}")
                self._yolo = None
                self._mode = "mock"
                self._model_version = MOCK_MODEL_VERSION
        finally:
            self._ready = True

    def _load_caption_model(self) -> None:
        try:
            from transformers import AutoModelForCausalLM, AutoProcessor
            import torch

            path = caption_weights_dir()
            if path is None:
                return
            dtype = torch.float16 if self._device in ("cuda", "mps") else torch.float32
            self._caption_processor = AutoProcessor.from_pretrained(
                str(path),
                trust_remote_code=True,
            )
            self._caption_model = AutoModelForCausalLM.from_pretrained(
                str(path),
                torch_dtype=dtype,
                trust_remote_code=True,
            )
            self._caption_model.to(self._device)
            self._caption_model.eval()
        except Exception:
            self._caption_model = None
            self._caption_processor = None
            self._caption_enabled = False

    def parse_jpeg(
        self,
        image_bytes: bytes,
        *,
        max_marks: int,
        min_confidence: float,
    ) -> list[ParsedMark]:
        if self._mode == "mock" or self._yolo is None:
            return mock_marks(max_marks, min_confidence)

        image = decode_image_bytes(image_bytes)
        width, height = image.size

        # Downscale very large captures to stay inside the 2s Glass budget.
        max_edge = int(os.environ.get("IIVO_OMNIPARSER_MAX_EDGE", "1280"))
        infer_image = image
        scale_x = 1.0
        scale_y = 1.0
        if max(width, height) > max_edge:
            ratio = max_edge / float(max(width, height))
            infer_w = max(1, int(width * ratio))
            infer_h = max(1, int(height * ratio))
            infer_image = image.resize((infer_w, infer_h), Image.Resampling.BILINEAR)
            scale_x = width / infer_w
            scale_y = height / infer_h

        results = self._yolo.predict(
            source=infer_image,
            conf=min_confidence,
            iou=0.7,
            verbose=False,
            device=self._device if self._device != "mps" else "mps",
        )
        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return []

        detections: list[ParsedMark] = []
        xyxy = boxes.xyxy.cpu().tolist()
        confs = boxes.conf.cpu().tolist()

        for idx, (box, conf) in enumerate(zip(xyxy, confs, strict=True)):
            x1, y1, x2, y2 = box
            x1 *= scale_x
            x2 *= scale_x
            y1 *= scale_y
            y2 *= scale_y
            normalized = xyxy_pixels_to_normalized(x1, y1, x2, y2, width, height)
            if normalized is None:
                continue
            nx, ny, nw, nh = normalized
            detections.append(
                ParsedMark(
                    id=f"som-{idx + 1}",
                    label="icon",
                    x=nx,
                    y=ny,
                    w=nw,
                    h=nh,
                    confidence=round(float(conf), 3),
                )
            )

        detections.sort(key=lambda m: (-m.confidence, m.y, m.x))
        detections = detections[:max_marks]

        if self._caption_enabled and self._caption_model and self._caption_processor:
            self._apply_captions(image, detections)

        ordered = sort_reading_order(detections)
        return [
            ParsedMark(
                id=f"som-{i + 1}",
                label=mark.label,
                x=mark.x,
                y=mark.y,
                w=mark.w,
                h=mark.h,
                confidence=mark.confidence,
            )
            for i, mark in enumerate(ordered)
        ]

    def _apply_captions(self, image: Image.Image, marks: list[ParsedMark]) -> None:
        import torch

        if not marks or self._caption_model is None or self._caption_processor is None:
            return

        max_caption = int(os.environ.get("IIVO_OMNIPARSER_MAX_CAPTIONS", "8"))
        width, height = image.size
        crops: list[Image.Image] = []
        indices: list[int] = []

        for i, mark in enumerate(marks[:max_caption]):
            x1 = int(mark.x * width)
            y1 = int(mark.y * height)
            x2 = int((mark.x + mark.w) * width)
            y2 = int((mark.y + mark.h) * height)
            if x2 <= x1 or y2 <= y1:
                continue
            crop = image.crop((x1, y1, x2, y2)).resize((64, 64), Image.Resampling.BILINEAR)
            crops.append(crop)
            indices.append(i)

        if not crops:
            return

        prompt = " "
        model = self._caption_model
        processor = self._caption_processor
        device = self._device

        with torch.inference_mode():
            for batch_start in range(0, len(crops), 4):
                batch = crops[batch_start : batch_start + 4]
                batch_idx = indices[batch_start : batch_start + 4]
                inputs = processor(
                    images=batch,
                    text=[prompt] * len(batch),
                    return_tensors="pt",
                    do_resize=False,
                )
                if device in ("cuda", "mps"):
                    inputs = inputs.to(device=device)
                    pixel_values = inputs.get("pixel_values")
                    if pixel_values is not None:
                        inputs["pixel_values"] = pixel_values.to(dtype=model.dtype)
                else:
                    inputs = inputs.to(device=device)

                generated_ids = model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs.get("pixel_values"),
                    max_new_tokens=24,
                    num_beams=1,
                    do_sample=False,
                )
                texts = processor.batch_decode(generated_ids, skip_special_tokens=True)
                for local_i, text in enumerate(texts):
                    label = text.strip() or "icon"
                    mark_i = batch_idx[local_i]
                    old = marks[mark_i]
                    marks[mark_i] = ParsedMark(
                        id=old.id,
                        label=label[:80],
                        x=old.x,
                        y=old.y,
                        w=old.w,
                        h=old.h,
                        confidence=old.confidence,
                    )
