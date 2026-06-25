import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalysisFailureNotice,
  buildSessionAnalysisPrompt,
} from "../shared/sessionPayload.ts";

test("analysis prompt builder", () => {
  const prompt = buildSessionAnalysisPrompt();
  assert.match(prompt, /Analyze this IIVO Glass work session/i);
  assert.match(prompt, /what happened/i);
  assert.match(prompt, /memory/i);
});

test("failure fallback notice", () => {
  assert.match(buildAnalysisFailureNotice("Network error"), /Open in IIVO/i);
});

test("no direct analysis on launch — idle state has no answer", () => {
  const idle = { status: "idle" as const };
  assert.equal(idle.status, "idle");
  assert.equal("text" in idle, false);
});

test("iivo analysis event shape", () => {
  const answer = "Strong insight: ship smaller.";
  const event = {
    kind: "iivo_analysis" as const,
    title: "IIVO Council analysis",
    text: answer,
    importance: "high" as const,
  };
  assert.equal(event.kind, "iivo_analysis");
  assert.equal(event.text, answer);
});
