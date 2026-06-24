import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXTRACT_DETECT_MIN_CHARS,
  extractBuildCardPhase,
  parseExtractDetectLabel,
  shouldRunExtractDetect,
} from "../shared/extractModeLogic.ts";

describe("parseExtractDetectLabel", () => {
  it("returns null for empty and literal null", () => {
    assert.equal(parseExtractDetectLabel(""), null);
    assert.equal(parseExtractDetectLabel("null"), null);
    assert.equal(parseExtractDetectLabel("NULL"), null);
  });

  it("strips wrapping quotes", () => {
    assert.equal(
      parseExtractDetectLabel('"real-time chat app with WebSockets"'),
      "real-time chat app with WebSockets",
    );
  });

  it("keeps valid labels", () => {
    assert.equal(
      parseExtractDetectLabel("AI agents for enterprise companies"),
      "AI agents for enterprise companies",
    );
  });
});

describe("shouldRunExtractDetect", () => {
  it("does not run when inactive or transcript too short", () => {
    assert.equal(
      shouldRunExtractDetect({
        active: false,
        transcriptLength: 500,
        lastDetectAt: 0,
        lastDetectTranscriptLength: 0,
        nowMs: 10_000,
      }),
      false,
    );
    assert.equal(
      shouldRunExtractDetect({
        active: true,
        transcriptLength: 50,
        lastDetectAt: 0,
        lastDetectTranscriptLength: 0,
        nowMs: 10_000,
      }),
      false,
    );
  });

  it("runs immediately when crossing minimum length", () => {
    assert.equal(
      shouldRunExtractDetect({
        active: true,
        transcriptLength: EXTRACT_DETECT_MIN_CHARS,
        lastDetectAt: 0,
        lastDetectTranscriptLength: 0,
        nowMs: 1_000,
      }),
      true,
    );
  });

  it("waits for debounce and new chars on subsequent passes", () => {
    const base = {
      active: true,
      transcriptLength: EXTRACT_DETECT_MIN_CHARS + 200,
      lastDetectTranscriptLength: EXTRACT_DETECT_MIN_CHARS,
      lastDetectAt: 1_000,
    };
    assert.equal(shouldRunExtractDetect({ ...base, nowMs: 5_000 }), false);
    assert.equal(shouldRunExtractDetect({ ...base, nowMs: 20_000 }), true);
  });
});

describe("extractBuildCardPhase", () => {
  it("hidden when inactive", () => {
    assert.equal(extractBuildCardPhase({ active: false, detectedLabel: "x" }), "hidden");
  });

  it("listening when active without label", () => {
    assert.equal(extractBuildCardPhase({ active: true, detectedLabel: null }), "listening");
  });

  it("detected when label present", () => {
    assert.equal(
      extractBuildCardPhase({ active: true, detectedLabel: "Stripe billing system" }),
      "detected",
    );
  });
});
