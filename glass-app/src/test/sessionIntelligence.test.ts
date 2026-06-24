import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSessionIntelligence,
  isDuplicateText,
  selectNewInsights,
} from "../shared/sessionIntelligence.ts";
import type { GlassSessionInsight } from "../shared/sessionTypes.ts";

function typesFor(text: string): string[] {
  return extractSessionIntelligence({ transcript: text }).map((c) => c.type);
}

test("classifies cue words deterministically", () => {
  assert.ok(typesFor("We might rethink the approach here.").includes("hypothesis"));
  assert.ok(typesFor("The real risk is privacy trust.").includes("risk"));
  assert.ok(typesFor("Next we should build the timeline.").includes("action"));
  assert.ok(typesFor("Remember to keep the dock minimal.").includes("memory_candidate"));
  assert.ok(typesFor("What is the strongest wedge for this product?").includes("question"));
  assert.ok(typesFor("The important point is positioning.").includes("key_idea"));
});

test("isDuplicateText catches heavy overlap and containment", () => {
  assert.equal(isDuplicateText("build the session timeline", "build the session timeline"), true);
  assert.equal(isDuplicateText("we should build the session timeline now", "build the session timeline"), true);
  assert.equal(isDuplicateText("privacy trust matters", "build the timeline"), false);
});

test("extraction dedupes near-identical candidates of the same type", () => {
  const out = extractSessionIntelligence({
    transcript: "We should build the timeline. We should build the timeline now.",
  });
  const actions = out.filter((c) => c.type === "action");
  assert.equal(actions.length, 1);
});

test("selectNewInsights drops candidates already present", () => {
  const existing: GlassSessionInsight[] = [
    {
      id: "1",
      sessionId: "s",
      timestamp: "t",
      type: "risk",
      title: "r",
      text: "the real risk is privacy trust",
      sourceEventIds: [],
      importance: "high",
    },
  ];
  const candidates = extractSessionIntelligence({
    transcript: "The real risk is privacy trust. Next we should ship it.",
  });
  const fresh = selectNewInsights(existing, candidates);
  assert.ok(!fresh.some((c) => c.type === "risk"));
  assert.ok(fresh.some((c) => c.type === "action"));
});

test("pulls text from events", () => {
  const out = extractSessionIntelligence({
    events: [
      {
        id: "e1",
        sessionId: "s",
        kind: "manual_note",
        timestamp: "t",
        title: "We need to validate the wedge",
      },
    ],
  });
  const action = out.find((c) => c.type === "action");
  assert.ok(action);
  assert.deepEqual(action?.sourceEventIds, ["e1"]);
});
