/**
 * Glass This — core QA flows (ambient, copy, Open in Glass).
 * Run: npm run glass:qa:text-overlay
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runTextOverlayQASuite,
  simulateAmbientReadingFlow,
  simulateCopyTriggerLoop,
  simulateOpenInGlassAction,
  shouldFireClipboardTrigger,
} from "../shared/textOverlaySimulation.ts";
import { LEGAL_PDF_SENTENCE, buildMockTextOverlayCard } from "../shared/textOverlayFixtures.ts";
import { parseAmbientReadingJson } from "../shared/textOverlayTypes.ts";

describe("Glass This core QA — simulation suite", () => {
  it("runs full QA report with zero failures", () => {
    const report = runTextOverlayQASuite();
    for (const result of report.results) {
      assert.equal(
        result.pass,
        true,
        `${result.name}\n  ${result.detail}`,
      );
    }
    assert.equal(report.failCount, 0);
    assert.ok(report.passCount >= 8);
  });
});

describe("Ambient — passive reading intelligence", () => {
  it("produces card from legal PDF probe without user action", () => {
    const state = simulateAmbientReadingFlow({
      readingIdle: true,
      overlayBusy: false,
    });
    assert.ok(state.card);
    assert.equal(state.card?.triggerSource, "ambient");
    assert.match(state.card?.rawText ?? "", /Indemnifying Party/);
    assert.match(state.card?.level1 ?? "", /liability/i);
    assert.equal(state.ambientTimerReset, true);
  });

  it("does not fire while user is scrolling or typing (busy gate)", () => {
    const state = simulateAmbientReadingFlow({
      readingIdle: true,
      overlayBusy: true,
    });
    assert.equal(state.card, null);
  });

  it("respects Haiku SKIP response", () => {
    assert.equal(parseAmbientReadingJson("SKIP"), null);
  });
});

describe("Copy trigger — immediate card, no copy-loop", () => {
  it("fires on first complex copy", () => {
    assert.equal(
      shouldFireClipboardTrigger("", LEGAL_PDF_SENTENCE),
      true,
    );
  });

  it("does not re-fire after card acknowledges clipboard", () => {
    const loop = simulateCopyTriggerLoop({
      userCopies: LEGAL_PDF_SENTENCE,
      cardCopyPayload: "Plain summary copied from card",
    });
    assert.deepEqual(loop.triggers, ["clipboard"]);
  });
});

describe("Open in Glass — full ask without Enter", () => {
  it("submits ask prompt with context, not command-bar prefill", () => {
    const card = buildMockTextOverlayCard({
      id: "qa-open",
      rawText: LEGAL_PDF_SENTENCE,
      contentType: "legal_contract",
      triggerSource: "clipboard",
    });
    const result = simulateOpenInGlassAction(card);
    assert.equal(result.submitAskCalled, true);
    assert.equal(result.prefillCalled, false);
    assert.equal(result.cardDismissed, true);
    assert.match(result.submittedPrompt ?? "", /Indemnifying Party/);
    assert.match(result.submittedPrompt ?? "", /Glass summary/);
  });
});
