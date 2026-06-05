import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeterministicDiagnosticFallback,
  buildDiagnosticAnalysisPrompt,
  parseDiagnosticAnalysisResponse,
} from "../shared/copilotDiagnosticAnalysis.ts";
import type { DiagnosticPacket } from "../shared/copilotDiagnostic.ts";

const samplePacket: DiagnosticPacket = {
  observedSymptoms: ["Error: permission denied", "Still failing after toggle"],
  repeatedSignals: ["why is mic still denied"],
  timeline: ["transcript_note: permission denied"],
  likelyCategory: "setup_loop",
  missingEvidence: ["Current permission state"],
  suggestedQuestion: "What setup step is still missing?",
};

test("diagnostic analysis prompt includes packet and forbids Council", () => {
  const prompt = buildDiagnosticAnalysisPrompt(samplePacket, {
    transcript: "mic permission keeps failing",
    recentCommands: ["why mic denied"],
    sourceApp: "IIVO Glass",
  });
  assert.match(prompt, /NOT Council/i);
  assert.match(prompt, /permission denied/i);
  assert.match(prompt, /why mic denied/i);
});

test("parse diagnostic AI response into structured result", () => {
  const text = [
    "## Probable root cause",
    "Microphone permission was denied and not granted for the packaged app.",
    "",
    "## Evidence",
    "- Permission denied banner",
    "- User toggled setting",
    "",
    "## What is still missing",
    "- System Settings screenshot",
    "",
    "## Next 3 actions",
    "- Open Microphone Settings",
    "- Re-launch Glass",
    "- Retry mic test",
    "",
    "## Suggested prompt",
    "Help me fix microphone permission for IIVO Glass",
  ].join("\n");
  const result = parseDiagnosticAnalysisResponse(text, "d1", "2026-01-01T00:00:00.000Z");
  assert.ok(result.probableRootCause.includes("Microphone"));
  assert.equal(result.nextActions.length, 3);
  assert.equal(result.aiEnhanced, true);
});

test("deterministic fallback when AI unavailable", () => {
  const result = buildDeterministicDiagnosticFallback(samplePacket, "d2", "2026-01-01T00:00:00.000Z");
  assert.equal(result.aiEnhanced, false);
  assert.ok(result.nextActions.length >= 3);
  assert.ok(result.fullMarkdown.includes("Probable root cause"));
});
