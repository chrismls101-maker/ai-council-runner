import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLocalSessionSummary } from "../main/glassMemoryLocal.ts";

test("buildLocalSessionSummary captures user ask and assistant reply", () => {
  const transcript = [
    "user: How do I fix TypeScript strict mode errors?",
    "assistant: Enable strict gradually and fix implicit any first.",
  ].join("\n");

  const summary = buildLocalSessionSummary(transcript);
  assert.match(summary, /TypeScript strict mode/i);
  assert.match(summary, /implicit any/i);
});

test("buildLocalSessionSummary handles council agent roles", () => {
  const transcript = [
    "user: Should we ship this week?",
    "strategy: Ship a thin slice first.",
    "judge: Yes, ship the thin slice.",
  ].join("\n");

  const summary = buildLocalSessionSummary(transcript);
  assert.match(summary, /ship this week/i);
  assert.match(summary, /thin slice/i);
});

test("buildLocalSessionSummary returns clipped raw text when roles missing", () => {
  const transcript = "A".repeat(600);
  const summary = buildLocalSessionSummary(transcript);
  assert.ok(summary.length <= 500);
  assert.match(summary, /…$/);
});
