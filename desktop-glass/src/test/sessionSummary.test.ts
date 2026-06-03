import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionSummary, buildSuggestedPrompt } from "../shared/sessionSummary.ts";
import type { GlassSession } from "../shared/sessionTypes.ts";

function sampleSession(): GlassSession {
  return {
    id: "s1",
    title: "AI agents research",
    status: "active",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    events: [
      { id: "e1", sessionId: "s1", kind: "screen_capture", timestamp: "2026-01-01T00:01:00.000Z", title: "Captured Cursor" },
      { id: "e2", sessionId: "s1", kind: "manual_note", timestamp: "2026-01-01T00:02:00.000Z", title: "Positioning note", text: "IIVO Glass as a live layer" },
    ],
    insights: [
      { id: "i1", sessionId: "s1", timestamp: "t", type: "key_idea", title: "k", text: "Position Glass as a live intelligence layer", sourceEventIds: [], importance: "high", accepted: true },
      { id: "i2", sessionId: "s1", timestamp: "t", type: "risk", title: "r", text: "Privacy trust must be clear", sourceEventIds: [], importance: "high" },
      { id: "i3", sessionId: "s1", timestamp: "t", type: "action", title: "a", text: "Build the session timeline", sourceEventIds: [], importance: "high" },
    ],
  };
}

test("summary is deterministic and contains all sections", () => {
  const s = sampleSession();
  const a = buildSessionSummary(s);
  const b = buildSessionSummary(s);
  assert.equal(a, b);
  assert.match(a, /Session Summary/);
  assert.match(a, /What happened:/);
  assert.match(a, /Key ideas:/);
  assert.match(a, /Risks:/);
  assert.match(a, /Action items:/);
  assert.match(a, /Suggested next IIVO prompt:/);
});

test("summary reflects event counts and insight text", () => {
  const a = buildSessionSummary(sampleSession());
  assert.match(a, /Captured 1 screen/);
  assert.match(a, /Privacy trust must be clear/);
  assert.match(a, /Position Glass as a live intelligence layer/);
});

test("suggested prompt prefers an action item", () => {
  const prompt = buildSuggestedPrompt(sampleSession());
  assert.match(prompt, /Build the session timeline/);
});

test("empty session still produces a valid summary", () => {
  const empty: GlassSession = {
    id: "x",
    title: "Empty",
    status: "active",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    events: [],
    insights: [],
  };
  const out = buildSessionSummary(empty);
  assert.match(out, /No events recorded yet\./);
  assert.match(out, /Suggested next IIVO prompt:/);
});
