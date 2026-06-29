import { test } from "node:test";
import assert from "node:assert/strict";
import { selectMemoryHitsWithinBudget } from "../main/glassMemoryPure.ts";

test("selectMemoryHitsWithinBudget ranks lower scores first and respects token budget", () => {
  const hits = [
    { id: "a", summary: "AAAA", score: 0.9 },
    { id: "b", summary: "BBBBBBBB", score: 0.1 },
    { id: "c", summary: "CC", score: 0.5 },
  ];

  const { selected, summaries } = selectMemoryHitsWithinBudget(hits, 2);
  assert.deepEqual(selected.map((h) => h.id), ["b"]);
  assert.deepEqual(summaries, ["BBBBBBBB"]);
});

test("selectMemoryHitsWithinBudget skips empty summaries", () => {
  const hits = [
    { id: "a", summary: "   ", score: 0.1 },
    { id: "b", summary: "Valid memory", score: 0.2 },
  ];

  const { selected } = selectMemoryHitsWithinBudget(hits, 100);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, "b");
});
