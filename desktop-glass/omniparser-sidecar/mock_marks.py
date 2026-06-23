"""Deterministic mock marks (Spike 1) for pipeline testing without model weights."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedMark:
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    confidence: float


def mock_marks(max_marks: int, min_confidence: float) -> list[ParsedMark]:
    labels = ["Submit", "Cancel", "Settings", "Search", "Menu", "Profile"]
    marks: list[ParsedMark] = []
    for i in range(min(6, max_marks)):
        row = i // 3
        col = i % 3
        confidence = 0.91 - i * 0.04
        if confidence < min_confidence:
            continue
        marks.append(
            ParsedMark(
                id=f"som-{i + 1}",
                label=labels[i % len(labels)],
                x=round(0.08 + col * 0.30, 4),
                y=round(0.12 + row * 0.38, 4),
                w=0.22,
                h=0.07,
                confidence=round(confidence, 3),
            )
        )
    return marks
