import { test } from "node:test";
import assert from "node:assert/strict";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import {
  buildListenThoughtFeedContent,
  listenCardTextIsVague,
  sourceAnchorLabel,
} from "../shared/listenThoughtCards.ts";

function sampleMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const now = new Date().toISOString();
  return {
    id: "m1",
    type: "key_idea",
    summary: "Distribution may matter more than software speed.",
    transcriptAnchors: ["Distribution may matter more than software speed for founders."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.85,
    importance: "high",
    suggestedThought: "The speaker argues distribution may matter more than software speed.",
    reasonSelected: "High-signal founder insight.",
    status: "ready",
    ...overrides,
  };
}

test("source anchor label is source-agnostic by default", () => {
  assert.equal(sourceAnchorLabel(), "From what was said:");
  assert.equal(
    sourceAnchorLabel({ sourceType: "youtube", channelOrSource: "SVG", capturedAt: "", confidence: "high" }),
    "From SVG:",
  );
});

test("proactive card preview has thought, why, and anchor — not action-first", () => {
  const feed = buildListenThoughtFeedContent(sampleMoment());
  assert.match(feed.body, /distribution/i);
  assert.match(feed.body, /Why it matters:/);
  assert.match(feed.contextLine, /From what was said:/);
  assert.doesNotMatch(feed.body, /I saved this for your Listen Report/);
  assert.doesNotMatch(feed.body, /should we take action/i);
  assert.ok(feed.fullBody.length > feed.body.length);
});

test("card never uses naked vague this prompts", () => {
  assert.equal(listenCardTextIsVague("Create a prompt from this?"), true);
  assert.equal(listenCardTextIsVague("Turn this into action?"), true);
  const feed = buildListenThoughtFeedContent(sampleMoment());
  assert.equal(listenCardTextIsVague(`${feed.title} ${feed.body}`), false);
});

test("expanded card shows full structured text", () => {
  const feed = buildListenThoughtFeedContent(sampleMoment());
  assert.match(feed.fullBody, /Why it matters:/);
  assert.match(feed.fullBody, /Listen Report/);
  assert.match(feed.fullBody, /From what was said:/);
});

test("channel-specific anchor when mediaContext present", () => {
  const feed = buildListenThoughtFeedContent(sampleMoment(), {
    sourceType: "youtube",
    channelOrSource: "Lenny's Podcast",
    capturedAt: new Date().toISOString(),
    confidence: "high",
  });
  assert.match(feed.sourceAnchor, /From Lenny's Podcast:/);
});
