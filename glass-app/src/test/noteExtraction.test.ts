import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNotes, emptyNotes } from "../shared/noteExtraction.ts";

test("empty transcript yields empty notes", () => {
  const notes = extractNotes("");
  assert.deepEqual(notes, emptyNotes());
});

test("detects questions, actions, and hypotheses", () => {
  const transcript = [
    "The onboarding funnel drops off at the payment step.",
    "What if the pricing page is confusing?",
    "We need to add a clearer CTA on the hero.",
    "Maybe the mobile layout is the real problem.",
  ].join(" ");

  const notes = extractNotes(transcript);

  assert.ok(notes.questions.some((q) => q.includes("pricing page")));
  assert.ok(notes.actionItems.some((a) => a.includes("clearer CTA")));
  assert.ok(notes.hypotheses.some((h) => h.includes("mobile layout")));
  assert.ok(notes.keyIdeas.some((k) => k.includes("onboarding funnel")));
  assert.ok(notes.summary.length > 0);
});

test("dedupes repeated lines and caps buckets", () => {
  const repeated = Array.from({ length: 20 }, () => "We need to follow up tomorrow.").join(" ");
  const notes = extractNotes(repeated);
  assert.equal(notes.actionItems.length, 1);
  assert.ok(notes.actionItems.length <= 6);
});
