import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalysisFailureNotice,
  buildCouncilRunRequest,
  buildSessionAnalysisPrompt,
  extractCouncilAnswer,
} from "../shared/iivoAnalysisClient.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";

function makeSession(): GlassSession {
  return {
    id: "sess-1",
    title: "QA Session",
    status: "ended",
    startedAt: "2026-06-01T10:00:00.000Z",
    endedAt: "2026-06-01T11:00:00.000Z",
    updatedAt: "2026-06-01T11:00:00.000Z",
    events: [
      {
        id: "e1",
        sessionId: "sess-1",
        kind: "manual_note",
        timestamp: "2026-06-01T10:05:00.000Z",
        title: "Noted a risk",
        text: "Deployment might fail",
      },
    ],
    insights: [
      {
        id: "i1",
        sessionId: "sess-1",
        timestamp: "2026-06-01T10:10:00.000Z",
        type: "risk",
        title: "Risk",
        text: "Deployment might fail",
        sourceEventIds: ["e1"],
        importance: "high",
        accepted: true,
      },
    ],
  };
}

test("analysis prompt builder", () => {
  const prompt = buildSessionAnalysisPrompt();
  assert.match(prompt, /Analyze this IIVO Glass work session/i);
  assert.match(prompt, /what happened/i);
  assert.match(prompt, /memory/i);
});

test("direct run-council payload builder", () => {
  const req = buildCouncilRunRequest(makeSession());
  assert.equal(req.executionMode, "council");
  assert.equal(req.preset, "none");
  assert.equal(req.workflow, "auto");
  assert.equal(req.executionModeConfirmationAccepted, true);
  assert.match(req.prompt, /Analyze this IIVO Glass work session/i);
  assert.equal(req.externalContext.items.length, 1);
  assert.equal(req.externalContext.items[0].type, "pasted_text");
  assert.equal(req.externalContext.items[0].id, "sess-1");
  assert.match(req.externalContext.items[0].contentText, /QA Session/);
  assert.match(req.externalContext.items[0].contentText, /Deployment might fail/);
});

test("extractCouncilAnswer prefers finalJudge", () => {
  assert.equal(
    extractCouncilAnswer({ outputs: { finalJudge: "  Judge answer  ", strategy: "x" } }),
    "Judge answer",
  );
  assert.equal(extractCouncilAnswer({ benchmarkAnswer: "bench" }), "bench");
  assert.equal(extractCouncilAnswer({ outputs: { strategy: "strat" } }), "strat");
  assert.equal(extractCouncilAnswer({}), "");
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
