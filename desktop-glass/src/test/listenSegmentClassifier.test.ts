import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyListenSegment } from "../shared/listenSegmentClassifier.ts";

test("Skip Ad screen text → ad segment", () => {
  const result = classifyListenSegment({
    visibleText: "Skip Ad · 0:05",
    transcript: "Try our product today.",
  });
  assert.equal(result.kind, "ad");
  assert.equal(result.suppressProactive, true);
  assert.equal(result.excludeFromReport, true);
});

test("sponsored by transcript → sponsor segment", () => {
  const result = classifyListenSegment({
    transcript: "This episode is brought to you by Acme Cloud. Use code SAVE20.",
  });
  assert.equal(result.kind, "sponsor");
  assert.equal(result.suppressProactive, true);
});

test("welcome back intro in first minute → intro", () => {
  const result = classifyListenSegment({
    transcript: "Welcome back everyone. Today we're talking about AI founders and distribution.",
  });
  assert.equal(result.kind, "intro");
  assert.equal(result.suppressProactive, true);
});

test("main content after intro → content", () => {
  const result = classifyListenSegment({
    transcript:
      "Distribution may matter more than software speed when you are an early-stage founder with limited runway and no existing audience.",
    mediaTitle: "AI founder distribution strategies",
  });
  assert.equal(result.kind, "content");
  assert.equal(result.suppressProactive, false);
});

test("unrelated product pitch during AI video → likely ad", () => {
  const result = classifyListenSegment({
    transcript: "Limited time offer — buy this brand mattress with discount code SPRING. Click the link below.",
    mediaTitle: "How AI founders think about distribution",
  });
  assert.equal(result.kind, "ad");
});
