import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGroundedListenThought,
  isActionFirstListenCard,
  isGroundedListenInsight,
  isShallowListenThought,
  listenSpeakerLabel,
  listenSourceAttribution,
  listenThoughtHasAnchor,
  listenThoughtHasWhyItMatters,
  mentionsAiToolWithoutContext,
} from "../shared/listenInsightQuality.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

function groundedMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const anchor =
    "Distribution and trust may matter more than raw software speed for early founders.";
  const now = new Date().toISOString();
  const thought = `The important part here is that the speaker says ${anchor.charAt(0).toLowerCase()}${anchor.slice(1)}`;
  return {
    id: "m1",
    type: "key_idea",
    summary: anchor,
    transcriptAnchors: [anchor, `${anchor} Repeated.`, `${anchor} Third line.`],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.9,
    importance: "high",
    suggestedThought: thought,
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    status: "ready",
    ...overrides,
  };
}

test("generic risk phrase is rejected", () => {
  assert.equal(isShallowListenThought("That sounds like a risk! Should we take action?"), true);
});

test("card must include transcript anchor", () => {
  const m = groundedMoment();
  assert.equal(listenThoughtHasAnchor(m), true);
  const weak = groundedMoment({
    suggestedThought: "Something vague without overlap.",
    transcriptAnchors: ["Distribution and trust may matter more than raw software speed."],
  });
  assert.equal(listenThoughtHasAnchor(weak), false);
});

test("card must include why-it-matters", () => {
  const m = groundedMoment();
  assert.equal(listenThoughtHasWhyItMatters(m), true);
});

test("one vague sentence is saved silently, not surfaced", () => {
  const vague = groundedMoment({ suggestedThought: "That sounds like a risk!" });
  const result = isGroundedListenInsight(vague);
  assert.equal(result, false);
});

test("strong claim with anchors can surface after maturity threshold", () => {
  assert.equal(isGroundedListenInsight(groundedMoment()), true);
});

test("no your AI tool unless userGoalContext includes it", () => {
  const text = "This could help for your AI tool later.";
  assert.equal(mentionsAiToolWithoutContext(text, undefined), true);
  assert.equal(mentionsAiToolWithoutContext(text, "building an AI tool with Cursor"), false);
});

test("insight includes transcript anchor and meaning", () => {
  const anchor = "Speed alone may not be enough — distribution and trust are the real leverage.";
  const out = buildGroundedListenThought({
    type: "warning",
    transcriptAnchors: [anchor],
    summary: anchor,
  });
  assert.match(out.suggestedThought, /speaker/i);
  assert.match(out.suggestedThought, /distribution|trust|speed/i);
  assert.ok(out.reasonSelected.length >= 24);
});

test("insight does not over-personalize without userGoalContext", () => {
  const out = buildGroundedListenThought({
    type: "key_idea",
    transcriptAnchors: ["Founders should focus on distribution early."],
    summary: "Founders should focus on distribution early.",
  });
  assert.ok(!/\byour AI tool\b/i.test(out.suggestedThought));
});

test("no invented speaker name — uses the speaker", () => {
  assert.equal(listenSpeakerLabel({}), "the speaker");
});

test("uses channel/title only from mediaContext", () => {
  const label = listenSpeakerLabel({
    mediaContext: {
      sourceType: "youtube",
      title: "How to grow",
      channelOrSource: "Silicon Valley Girl",
      capturedAt: new Date().toISOString(),
      confidence: "high",
    },
  });
  assert.match(label, /Silicon Valley Girl/);
  const attr = listenSourceAttribution({
    mediaContext: {
      sourceType: "youtube",
      channelOrSource: "Silicon Valley Girl",
      capturedAt: new Date().toISOString(),
      confidence: "high",
    },
  });
  assert.match(attr!, /Silicon Valley Girl/);
});

test("action-first card copy is detected", () => {
  assert.equal(isActionFirstListenCard("Should we take action on this now?"), true);
  assert.equal(
    isActionFirstListenCard("The speaker warns that distribution matters more than speed."),
    false,
  );
});
