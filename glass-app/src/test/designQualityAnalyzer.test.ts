import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCaptureQuality,
  qualityWarningLabel,
} from "../main/design/designQualityAnalyzer.ts";

function tinyPngDataUrl(): string {
  // 1x1 PNG — very small payload
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

function largerFakeJpeg(): string {
  const base64 = "A".repeat(40_000);
  return `data:image/jpeg;base64,${base64}`;
}

describe("analyzeCaptureQuality", () => {
  test("invalid data URL returns low confidence", () => {
    const q = analyzeCaptureQuality("not-a-data-url");
    assert.equal(q.readable, false);
    assert.ok(q.issues.includes("low_signal"));
  });

  test("tiny image flags quality issues", () => {
    const q = analyzeCaptureQuality(tinyPngDataUrl());
    assert.ok(q.issues.length > 0);
    assert.ok(q.confidence < 0.55);
  });

  test("large payload improves confidence", () => {
    const q = analyzeCaptureQuality(largerFakeJpeg());
    assert.ok(q.confidence > 0.35);
  });
});

describe("qualityWarningLabel", () => {
  test("returns null for high confidence clean capture", () => {
    const label = qualityWarningLabel({
      readable: true,
      confidence: 0.8,
      issues: [],
    });
    assert.equal(label, null);
  });

  test("returns recommendation when present", () => {
    const label = qualityWarningLabel({
      readable: false,
      confidence: 0.2,
      issues: ["low_signal"],
      recommendation: "Recapture please",
    });
    assert.equal(label, "Recapture please");
  });
});
