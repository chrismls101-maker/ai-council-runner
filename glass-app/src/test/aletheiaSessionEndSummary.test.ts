import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAletheiaSessionEndSummary } from "../shared/aletheiaSessionEndSummary.ts";

test("buildAletheiaSessionEndSummary captures pending advice and action", () => {
  const summary = buildAletheiaSessionEndSummary({
    turnCount: 3,
    pendingAdviceCount: 2,
    pendingAdviceHeadline: "Terminal error on npm test",
    pendingActionSummary: "Run npm test in project root",
    frontApp: "Cursor",
  });
  assert.ok(summary);
  assert.match(summary!, /2 advice cards still pending/i);
  assert.match(summary!, /Terminal error/i);
  assert.match(summary!, /Action awaiting confirm/i);
});

test("buildAletheiaSessionEndSummary falls back to turn count", () => {
  const summary = buildAletheiaSessionEndSummary({
    turnCount: 4,
    pendingAdviceCount: 0,
    frontApp: "Terminal",
  });
  assert.equal(summary, "4 voice turns in Terminal");
});

test("buildAletheiaSessionEndSummary returns undefined for empty session", () => {
  assert.equal(
    buildAletheiaSessionEndSummary({ turnCount: 0, pendingAdviceCount: 0 }),
    undefined,
  );
});
