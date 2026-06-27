import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendRelationshipEvent,
  buildRelationshipReturnBrief,
  emptyAletheiaRelationshipThread,
  markCompanionAway,
} from "../shared/aletheiaRelationshipThread.ts";

test("buildRelationshipReturnBrief summarizes queued events after meaningful away time", () => {
  const now = Date.now();
  let snapshot = markCompanionAway(
    appendRelationshipEvent(emptyAletheiaRelationshipThread(now - 60_000), {
      kind: "terminal_error",
      summary: "npm test failed with 2 errors",
      now: now - 30_000,
    }),
    "YouTube",
    now - 60_000,
  );

  const result = buildRelationshipReturnBrief(snapshot, "Cursor", now);
  assert.ok(result);
  assert.match(result!.brief, /YouTube/i);
  assert.match(result!.brief, /npm test failed/i);
  assert.equal(result!.snapshot.awayApp, undefined);
});

test("buildRelationshipReturnBrief skips quick app switches", () => {
  const now = Date.now();
  const snapshot = markCompanionAway(emptyAletheiaRelationshipThread(now), "Safari", now - 2_000);
  assert.equal(buildRelationshipReturnBrief(snapshot, "Cursor", now), null);
});
