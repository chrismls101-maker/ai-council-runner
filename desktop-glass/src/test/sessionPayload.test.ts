import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionContextPayload, SESSION_SOURCE } from "../shared/sessionPayload.ts";
import { GLASS_CAPTURED_VIA } from "../shared/contextPayload.ts";
import type { GlassSession, GlassSessionEvent, GlassSessionInsight } from "../shared/sessionTypes.ts";

function makeSession(eventCount: number, insightCount: number): GlassSession {
  const events: GlassSessionEvent[] = Array.from({ length: eventCount }, (_, i) => ({
    id: `e${i}`,
    sessionId: "s1",
    kind: "manual_note",
    timestamp: `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
    title: `Event ${i}`,
  }));
  const insights: GlassSessionInsight[] = Array.from({ length: insightCount }, (_, i) => ({
    id: `i${i}`,
    sessionId: "s1",
    timestamp: "t",
    type: "key_idea",
    title: `Insight ${i}`,
    text: `Insight text ${i}`,
    sourceEventIds: [],
    importance: "medium",
  }));
  return {
    id: "s1",
    title: "Test Session",
    status: "ended",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T01:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    events,
    insights,
  };
}

test("payload is a server-compatible pasted_text item with session metadata", () => {
  const { payload } = buildSessionContextPayload(makeSession(3, 2));
  assert.equal(payload.type, "pasted_text");
  assert.equal(payload.capturedVia, GLASS_CAPTURED_VIA);
  assert.match(payload.title, /^IIVO Glass Session — Test Session$/);
  assert.ok(payload.tags.includes("session"));
  assert.match(payload.contentText, new RegExp(SESSION_SOURCE));
  assert.match(payload.contentText, /sessionId: s1/);
  assert.match(payload.contentText, /Events: 3 \| Insights: 2/);
});

test("not truncated for small sessions", () => {
  const res = buildSessionContextPayload(makeSession(5, 3));
  assert.equal(res.truncated, false);
  assert.equal(res.includedEventCount, 5);
  assert.equal(res.includedInsightCount, 3);
});

test("truncates to max 25 events and 10 insights", () => {
  const res = buildSessionContextPayload(makeSession(40, 20));
  assert.equal(res.truncated, true);
  assert.equal(res.includedEventCount, 25);
  assert.equal(res.includedInsightCount, 10);
  assert.match(res.payload.contentText, /truncated/);
});

test("respects custom limits", () => {
  const res = buildSessionContextPayload(makeSession(10, 10), { maxEvents: 2, maxInsights: 1 });
  assert.equal(res.includedEventCount, 2);
  assert.equal(res.includedInsightCount, 1);
  assert.equal(res.truncated, true);
});

test("accepted insights are prioritized in the payload", () => {
  const session = makeSession(2, 12);
  session.insights[11].accepted = true;
  session.insights[11].text = "ACCEPTED IMPORTANT INSIGHT";
  const res = buildSessionContextPayload(session);
  assert.match(res.payload.contentText, /ACCEPTED IMPORTANT INSIGHT/);
});
